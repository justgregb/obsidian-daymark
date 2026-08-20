import { normalizePath, Notice, Plugin, TFile, TFolder, type TAbstractFile, type WorkspaceLeaf } from "obsidian";
import { AdditionalWordIndex } from "./additional-word-index";
import { DAYMARK_CALENDAR_VIEW_TYPE, DaymarkCalendarView } from "./calendar-view";
import { confirmDailyNoteCreation } from "./create-note-modal";
import { dailyNotePath, renderDailyNoteTemplate } from "./daily-note";
import { parseIsoDate, todayPlainDate } from "./date";
import { promptForDate } from "./go-to-date-modal";
import { DaymarkIndex } from "./indexer";
import { isValidObsidianDateFormat } from "./obsidian-date";
import { daymarkMoment } from "./obsidian-moment";
import { legacyTallyToDaymarkState } from "./legacy-tally-state";
import { LEGACY_TALLY_VIEW_TYPE, LegacyTallyView } from "./legacy-tally-view";
import { appendQuickLogEntry, createQuickLogEntry } from "./quick-log";
import { promptQuickLog } from "./quick-log-modal";
import {
  normalizeTallyMetricLabels,
  normalizeTallyTagLabels
} from "./format";
import {
  DaymarkSettingTab,
  normalizeAdditionalWordFolder,
  normalizeJournalFolder,
  normalizeTemplatePath
} from "./settings";
import {
  settingsAreEqual,
  settingsRequireAdditionalWordRebuild,
  settingsRequireRebuild
} from "./settings-policy";
import { CURRENT_SETTINGS_VERSION, migrateStoredSettings } from "./settings-migration";
import {
  createSavedSummaryDescriptor,
  getSavedSummaryState,
  isGeneratedTallySummary,
  type SavedSummaryDescriptor,
  type SavedSummaryState
} from "./saved-summary";
import {
  DEFAULT_SETTINGS,
  type DaymarkSettings,
  type PeriodAggregate,
  type PeriodMode,
  type PlainDate,
  type Weekday
} from "./types";
import { normalizeHighlightedWeekdays, normalizeWeekStartSetting, resolveWeekStartSetting } from "./week-start";

interface WorkspaceWithOptionalReveal {
  revealLeaf?: (leaf: WorkspaceLeaf) => Promise<void>;
}

export default class DaymarkPlugin extends Plugin {
  override settings: DaymarkSettings = {
    ...DEFAULT_SETTINGS,
    tallyMetricLabels: {},
    tallyTagLabels: {}
  };
  index!: DaymarkIndex;
  additionalWordIndex!: AdditionalWordIndex;
  private readonly listeners = new Set<() => void>();
  private readonly refreshTimers = new Map<string, number>();
  private summaryDescriptors = new WeakMap<PeriodAggregate, Map<string, SavedSummaryDescriptor>>();
  private summaryStates = new WeakMap<SavedSummaryDescriptor, Promise<SavedSummaryState>>();
  private rebuildTimer: number | null = null;
  private additionalWordRebuildTimer: number | null = null;

  get locale(): string {
    return daymarkMoment.locale();
  }

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.index = new DaymarkIndex(this.app, () => this.settings, () => this.locale);
    this.additionalWordIndex = new AdditionalWordIndex(
      this.app,
      () => this.settings.additionalWordFolder,
      () => this.locale
    );

    this.registerView(DAYMARK_CALENDAR_VIEW_TYPE, (leaf: WorkspaceLeaf) => new DaymarkCalendarView(leaf, this));
    this.registerView(LEGACY_TALLY_VIEW_TYPE, (leaf: WorkspaceLeaf) => new LegacyTallyView(leaf));
    this.addRibbonIcon("calendar-days", "Open Daymark", () => {
      void this.openCalendarView();
    });
    this.addCommand({
      id: "open-calendar",
      name: "Open calendar",
      callback: () => {
        void this.openCalendarView();
      }
    });
    this.addCommand({
      id: "quick-log",
      name: "Quick log",
      callback: () => {
        void this.openQuickLog();
      }
    });
    this.addCommand({
      id: "open-todays-note",
      name: "Open today’s note",
      callback: () => {
        void this.openOrCreateDailyNote(todayPlainDate());
      }
    });
    this.addCommand({
      id: "go-to-date",
      name: "Go to date",
      callback: () => {
        void this.goToDate();
      }
    });
    this.addCommand({
      id: "open-tally",
      name: "Open Tally",
      checkCallback: (checking) => {
        if (!this.settings.tallyEnabled) return false;
        if (!checking) void this.openTallyView();
        return true;
      }
    });
    this.addCommand({
      id: "rebuild-index",
      name: "Rebuild index",
      callback: () => {
        void this.rebuildIndex().then(() => new Notice("Daymark index rebuilt."));
      }
    });
    this.addCommand({
      id: "save-current-period",
      name: "Save current Tally period",
      checkCallback: (checking) => {
        if (!this.settings.tallyEnabled) return false;
        if (!checking) void this.saveCurrentPeriod();
        return true;
      }
    });
    this.addSettingTab(new DaymarkSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.registerVaultEvents();
      if (!this.settings.tallyEnabled) this.app.workspace.detachLeavesOfType(LEGACY_TALLY_VIEW_TYPE);
      void this.migrateExistingSidebar();
    });
  }

  override onunload(): void {
    for (const timer of this.refreshTimers.values()) window.clearTimeout(timer);
    this.refreshTimers.clear();
    if (this.rebuildTimer !== null) window.clearTimeout(this.rebuildTimer);
    if (this.additionalWordRebuildTimer !== null) window.clearTimeout(this.additionalWordRebuildTimer);
    this.listeners.clear();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  resolveWeekStart(): Weekday {
    return resolveWeekStartSetting(this.settings.weekStart, daymarkMoment.localeData().firstDayOfWeek());
  }

  resolveLocaleWeekStart(): Weekday {
    return resolveWeekStartSetting("locale", daymarkMoment.localeData().firstDayOfWeek());
  }

  async updateSettings(change: Partial<DaymarkSettings>): Promise<void> {
    const previous = this.settings;
    const requestedDateFormat = change.dateFormat?.trim();
    const next: DaymarkSettings = {
      ...this.settings,
      ...change,
      settingsVersion: CURRENT_SETTINGS_VERSION,
      dateFormat: requestedDateFormat === undefined
        ? this.settings.dateFormat
        : isValidObsidianDateFormat(requestedDateFormat) ? requestedDateFormat : this.settings.dateFormat,
      journalFolder: change.journalFolder === undefined
        ? this.settings.journalFolder
        : normalizeJournalFolder(change.journalFolder),
      additionalWordFolder: change.additionalWordFolder === undefined
        ? this.settings.additionalWordFolder
        : normalizeAdditionalWordFolder(change.additionalWordFolder),
      templatePath: change.templatePath === undefined
        ? this.settings.templatePath
        : normalizeTemplatePath(change.templatePath),
      tallyMetricLabels: change.tallyMetricLabels === undefined
        ? this.settings.tallyMetricLabels
        : normalizeTallyMetricLabels(change.tallyMetricLabels),
      tallyTagLabels: change.tallyTagLabels === undefined
        ? this.settings.tallyTagLabels
        : normalizeTallyTagLabels(change.tallyTagLabels)
    };
    if (settingsAreEqual(previous, next)) return;
    this.settings = next;
    this.summaryDescriptors = new WeakMap();
    this.summaryStates = new WeakMap();
    await this.saveData(next);
    if (previous.tallyEnabled && !next.tallyEnabled) {
      this.app.workspace.detachLeavesOfType(LEGACY_TALLY_VIEW_TYPE);
      this.additionalWordIndex.reset();
      if (this.additionalWordRebuildTimer !== null) {
        window.clearTimeout(this.additionalWordRebuildTimer);
        this.additionalWordRebuildTimer = null;
      }
    }
    const rebuildDailyNotes = settingsRequireRebuild(previous, next);
    const rebuildAdditionalWords = settingsRequireAdditionalWordRebuild(previous, next);
    if (rebuildDailyNotes) this.scheduleRebuild();
    if (rebuildAdditionalWords) {
      this.scheduleAdditionalWordRebuild(!previous.tallyEnabled && next.tallyEnabled ? 0 : 400);
    }
    if (!rebuildDailyNotes && !rebuildAdditionalWords) this.emitChange();
  }

  async rebuildIndex(): Promise<void> {
    const rebuilds = [this.index.rebuild()];
    if (this.usesAdditionalWordIndex()) rebuilds.push(this.additionalWordIndex.rebuild());
    await Promise.all(rebuilds);
    this.emitChange();
  }

  async ensureTallyReady(): Promise<void> {
    const indexes = [this.index.ensureReady()];
    if (this.usesAdditionalWordIndex()) indexes.push(this.additionalWordIndex.ensureReady());
    await Promise.all(indexes);
  }

  async openOrCreateDailyNote(date: PlainDate): Promise<void> {
    try {
      const file = await this.getOrCreateDailyNote(date);
      if (!file) return;
      await this.app.workspace.getLeaf(false).openFile(file);
    } catch (error) {
      console.error("Daymark could not open the daily note.", error);
      new Notice(error instanceof Error ? error.message : "Daymark could not open the daily note.");
    }
  }

  private async openQuickLog(): Promise<void> {
    const text = await promptQuickLog(this.app);
    if (text === null) return;
    const capturedAt = new Date();
    const date = todayPlainDate(capturedAt);
    try {
      const file = await this.getOrCreateDailyNote(date);
      if (!file) return;
      const entry = createQuickLogEntry(text, capturedAt);
      await this.app.vault.process(file, (content) => appendQuickLogEntry(content, entry));
      new Notice("Added to today’s daily note.");
    } catch (error) {
      console.error("Daymark could not add the Quick Log entry.", error);
      new Notice(error instanceof Error ? error.message : "Daymark could not add the Quick Log entry.");
    }
  }

  private async getOrCreateDailyNote(date: PlainDate): Promise<TFile | null> {
    await this.index.ensureReady();
    const indexed = this.index.recordForDate(date);
    const indexedFile = indexed ? this.app.vault.getAbstractFileByPath(indexed.path) : null;
    if (indexedFile instanceof TFile) return indexedFile;

    const path = dailyNotePath(this.settings.journalFolder, this.settings.dateFormat, date);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFolder) throw new Error(`A folder already exists at ${path}.`);
    if (existing instanceof TFile) return existing;

    const confirmed = await confirmDailyNoteCreation(this.app, date, path, this.locale);
    if (!confirmed) return null;
    const confirmedExisting = this.app.vault.getAbstractFileByPath(path);
    if (confirmedExisting instanceof TFolder) throw new Error(`A folder already exists at ${path}.`);
    if (confirmedExisting instanceof TFile) return confirmedExisting;

    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    await this.ensureFolder(folder);
    const content = await this.dailyNoteContent(date);
    return this.app.vault.create(path, content);
  }

  async saveSummary(mode: PeriodMode, aggregate: PeriodAggregate): Promise<string | null> {
    if (!this.settings.tallyEnabled) throw new Error("Tally is disabled in Daymark settings.");
    if (aggregate.noteCount === 0) return null;
    const summary = this.summaryDescriptor(mode, aggregate);
    await this.ensureFolder(summary.folder);
    const existing = this.app.vault.getAbstractFileByPath(summary.path);
    if (existing instanceof TFolder) throw new Error(`A folder already exists at ${summary.path}.`);
    if (existing instanceof TFile) {
      const content = await this.app.vault.cachedRead(existing);
      const state = getSavedSummaryState(content, summary.content);
      if (state === "save" && !isGeneratedTallySummary(content)) {
        throw new Error(`Tally will not overwrite ${summary.path} because it was not generated by Tally.`);
      }
      if (state === "update") {
        await this.app.vault.process(existing, (current) => {
          const currentState = getSavedSummaryState(current, summary.content);
          if (currentState === "save" && !isGeneratedTallySummary(current)) {
            throw new Error(`Tally will not overwrite ${summary.path} because it was not generated by Tally.`);
          }
          return currentState === "update" ? summary.content : current;
        });
      }
    } else {
      await this.app.vault.create(summary.path, summary.content);
    }
    this.summaryStates.set(summary, Promise.resolve("saved"));
    return summary.path;
  }

  async summaryState(mode: PeriodMode, aggregate: PeriodAggregate): Promise<SavedSummaryState> {
    const summary = this.summaryDescriptor(mode, aggregate);
    const cached = this.summaryStates.get(summary);
    if (cached) return cached;
    const pending = this.readSummaryState(summary);
    this.summaryStates.set(summary, pending);
    try {
      return await pending;
    } catch (error) {
      if (this.summaryStates.get(summary) === pending) this.summaryStates.delete(summary);
      throw error;
    }
  }

  summaryPath(mode: PeriodMode, aggregate: PeriodAggregate): string {
    return this.summaryDescriptor(mode, aggregate).path;
  }

  private async loadSettings(): Promise<void> {
    const migration = migrateStoredSettings(await this.loadData());
    const stored = migration.settings;
    const dateFormat = stored?.dateFormat ?? DEFAULT_SETTINGS.dateFormat;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      settingsVersion: CURRENT_SETTINGS_VERSION,
      dateFormat: isValidObsidianDateFormat(dateFormat) ? dateFormat : DEFAULT_SETTINGS.dateFormat,
      highlightedWeekdays: normalizeHighlightedWeekdays(stored?.highlightedWeekdays),
      additionalWordFolder: normalizeAdditionalWordFolder(
        stored?.additionalWordFolder ?? DEFAULT_SETTINGS.additionalWordFolder
      ),
      journalFolder: normalizeJournalFolder(stored?.journalFolder ?? DEFAULT_SETTINGS.journalFolder),
      templatePath: normalizeTemplatePath(stored?.templatePath ?? DEFAULT_SETTINGS.templatePath),
      tallyMetricLabels: normalizeTallyMetricLabels(stored?.tallyMetricLabels),
      tallyTagLabels: normalizeTallyTagLabels(stored?.tallyTagLabels),
      weekStart: normalizeWeekStartSetting(stored?.weekStart)
    };
    if (migration.changed) await this.saveData(this.settings);
  }

  private registerVaultEvents(): void {
    this.registerEvent(this.app.vault.on("create", (file) => this.scheduleRefresh(file)));
    this.registerEvent(this.app.vault.on("modify", (file) => this.scheduleRefresh(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.removeFile(file)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.renameFile(file, oldPath)));
  }

  private scheduleRefresh(file: TAbstractFile): void {
    if (!(file instanceof TFile)) return;
    const summaryChanged = this.matchesSummaryPath(file.path);
    const refreshDailyNote = this.index.matches(file);
    const refreshAdditionalWords = this.usesAdditionalWordIndex() && this.additionalWordIndex.matches(file);
    if (!summaryChanged && !refreshDailyNote && !refreshAdditionalWords) return;
    const existing = this.refreshTimers.get(file.path);
    if (existing !== undefined) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      this.refreshTimers.delete(file.path);
      const refreshes: Promise<void>[] = [];
      if (refreshDailyNote) refreshes.push(this.index.refresh(file));
      if (refreshAdditionalWords) refreshes.push(this.additionalWordIndex.refresh(file));
      void Promise.all(refreshes).then(() => this.emitChange()).catch((error: unknown) => {
        console.error("Daymark could not refresh an indexed note.", error);
      });
    }, 250);
    this.refreshTimers.set(file.path, timer);
  }

  private removeFile(file: TAbstractFile): void {
    if (!(file instanceof TFile)) {
      this.scheduleRebuild();
      if (this.usesAdditionalWordIndex()) this.scheduleAdditionalWordRebuild();
      return;
    }
    const summaryChanged = this.matchesSummaryPath(file.path);
    const wasDailyNote = this.index.has(file.path);
    const wasAdditionalWordFile = this.additionalWordIndex.has(file.path);
    if (!summaryChanged && !wasDailyNote && !wasAdditionalWordFile) return;
    const timer = this.refreshTimers.get(file.path);
    if (timer !== undefined) window.clearTimeout(timer);
    const path = file.path;
    this.refreshTimers.set(path, window.setTimeout(() => {
      this.refreshTimers.delete(path);
      this.index.remove(path);
      this.additionalWordIndex.remove(path);
      this.emitChange();
    }, 250));
  }

  private renameFile(file: TAbstractFile, oldPath: string): void {
    const timer = this.refreshTimers.get(oldPath);
    if (timer !== undefined) window.clearTimeout(timer);
    this.refreshTimers.delete(oldPath);
    const summaryChanged = this.matchesSummaryPath(oldPath)
      || (file instanceof TFile && this.matchesSummaryPath(file.path));
    const wasDailyNote = this.index.has(oldPath);
    const wasAdditionalWordFile = this.additionalWordIndex.has(oldPath);
    if (wasDailyNote) this.index.remove(oldPath);
    if (wasAdditionalWordFile) this.additionalWordIndex.remove(oldPath);
    if (!(file instanceof TFile)) {
      this.scheduleRebuild();
      if (this.usesAdditionalWordIndex()) this.scheduleAdditionalWordRebuild();
      return;
    }
    if (this.index.matches(file)
      || (this.usesAdditionalWordIndex() && this.additionalWordIndex.matches(file))) this.scheduleRefresh(file);
    else if (wasDailyNote || wasAdditionalWordFile || summaryChanged) this.emitChange();
  }

  private scheduleRebuild(): void {
    if (this.rebuildTimer !== null) window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => {
      this.rebuildTimer = null;
      void this.index.rebuild().then(() => this.emitChange()).catch((error: unknown) => {
        console.error("Daymark could not rebuild its daily-note index.", error);
      });
    }, 400);
  }

  private scheduleAdditionalWordRebuild(delay = 400): void {
    if (this.additionalWordRebuildTimer !== null) window.clearTimeout(this.additionalWordRebuildTimer);
    this.additionalWordRebuildTimer = window.setTimeout(() => {
      this.additionalWordRebuildTimer = null;
      void this.additionalWordIndex.rebuild().then(() => this.emitChange()).catch((error: unknown) => {
        console.error("Daymark could not rebuild its additional word-count index.", error);
      });
    }, delay);
  }

  private emitChange(): void {
    this.summaryStates = new WeakMap();
    for (const listener of this.listeners) listener();
  }

  private usesAdditionalWordIndex(): boolean {
    return this.settings.tallyEnabled && this.settings.additionalWordFolder.length > 0;
  }

  private async readSummaryState(summary: SavedSummaryDescriptor): Promise<SavedSummaryState> {
    const existing = this.app.vault.getAbstractFileByPath(summary.path);
    if (!(existing instanceof TFile)) return "save";
    return getSavedSummaryState(await this.app.vault.cachedRead(existing), summary.content);
  }

  private async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path).replace(/^\/+|\/+$/gu, "");
    if (normalized.length === 0) return;
    let current = "";
    for (const part of normalized.split("/")) {
      current = current.length === 0 ? part : `${current}/${part}`;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFile) throw new Error(`A file already exists at ${current}.`);
      if (!existing) await this.app.vault.createFolder(current);
    }
  }

  private async dailyNoteContent(date: PlainDate): Promise<string> {
    if (this.settings.templatePath.length === 0) return "";
    const template = this.app.vault.getAbstractFileByPath(this.settings.templatePath);
    if (!(template instanceof TFile)) {
      throw new Error(`Daily note template not found: ${this.settings.templatePath}`);
    }
    const content = await this.app.vault.cachedRead(template);
    return renderDailyNoteTemplate(content, date, this.settings.dateFormat);
  }

  private summaryDescriptor(mode: PeriodMode, aggregate: PeriodAggregate): SavedSummaryDescriptor {
    const locale = this.locale;
    const weekStart = this.resolveWeekStart();
    const key = `${mode}/${locale}`;
    let descriptors = this.summaryDescriptors.get(aggregate);
    if (!descriptors) {
      descriptors = new Map();
      this.summaryDescriptors.set(aggregate, descriptors);
    }
    const cached = descriptors.get(key);
    if (cached) return cached;
    const descriptor = createSavedSummaryDescriptor(
      this.settings.journalFolder,
      mode,
      aggregate,
      weekStart,
      locale,
      this.settings.tallyTagLabels,
      this.settings.tallyMetricLabels
    );
    descriptors.set(key, descriptor);
    return descriptor;
  }

  private matchesSummaryPath(path: string): boolean {
    const normalized = normalizePath(path).replace(/^\/+|\/+$/gu, "");
    if (!normalized.endsWith(".md")) return false;
    const filename = normalized.slice(normalized.lastIndexOf("/") + 1);
    if (!filename.startsWith("Tally — ")) return false;
    const journalFolder = normalizePath(this.settings.journalFolder).replace(/^\/+|\/+$/gu, "");
    return journalFolder.length === 0
      || normalized.startsWith(`${journalFolder}/`);
  }

  private async saveCurrentPeriod(): Promise<void> {
    const view = await this.openTallyView();
    await view?.saveCurrentTallyPeriod();
  }

  private async goToDate(): Promise<void> {
    const date = await promptForDate(this.app, todayPlainDate());
    if (!date) return;
    const view = await this.openCalendarView();
    view?.showDate(date);
  }

  async openCalendarView(): Promise<DaymarkCalendarView | null> {
    const existing = this.app.workspace.getLeavesOfType(DAYMARK_CALENDAR_VIEW_TYPE);
    let leaf = existing.find((candidate) => candidate.getRoot() === this.app.workspace.rightSplit);
    if (leaf) {
      for (const candidate of existing) {
        if (candidate !== leaf) candidate.detach();
      }
    }
    if (!leaf) {
      this.app.workspace.detachLeavesOfType(DAYMARK_CALENDAR_VIEW_TYPE);
      leaf = this.app.workspace.getRightLeaf(true) ?? undefined;
      if (!leaf) {
        new Notice("Daymark could not open the right sidebar.");
        return null;
      }
      await leaf.setViewState({ type: DAYMARK_CALENDAR_VIEW_TYPE, active: true });
    }
    await this.revealSidebarLeaf(leaf);
    return leaf.view instanceof DaymarkCalendarView ? leaf.view : null;
  }

  async openTallyView(): Promise<DaymarkCalendarView | null> {
    if (!this.settings.tallyEnabled) {
      new Notice("Tally is disabled in Daymark settings.");
      return null;
    }
    const view = await this.openCalendarView();
    view?.expandTally();
    return view;
  }

  private async migrateExistingSidebar(): Promise<void> {
    const calendarLeaves = this.app.workspace.getLeavesOfType(DAYMARK_CALENDAR_VIEW_TYPE);
    const tallyLeaves = this.app.workspace.getLeavesOfType(LEGACY_TALLY_VIEW_TYPE);
    if (calendarLeaves.length > 0) {
      const legacyState = tallyLeaves[0]?.view instanceof LegacyTallyView ? tallyLeaves[0].view.getState() : null;
      this.app.workspace.detachLeavesOfType(LEGACY_TALLY_VIEW_TYPE);
      const view = await this.openCalendarView();
      if (legacyState) {
        const migrated = legacyTallyToDaymarkState(legacyState);
        const anchor = typeof migrated.selectedDate === "string" ? parseIsoDate(migrated.selectedDate) : null;
        if (anchor) view?.showPeriod(migrated.mode, anchor);
      }
      return;
    }
    const leaf = tallyLeaves.find((candidate) => candidate.getRoot() === this.app.workspace.rightSplit);
    if (!leaf) return;
    const legacyState = leaf.view instanceof LegacyTallyView ? leaf.view.getState() : {};
    for (const candidate of tallyLeaves) {
      if (candidate !== leaf) candidate.detach();
    }
    await leaf.setViewState({
      type: DAYMARK_CALENDAR_VIEW_TYPE,
      active: true,
      state: legacyTallyToDaymarkState(legacyState)
    });
    await this.revealSidebarLeaf(leaf);
  }

  private async revealSidebarLeaf(leaf: WorkspaceLeaf): Promise<void> {
    const revealLeaf = (this.app.workspace as unknown as WorkspaceWithOptionalReveal).revealLeaf;
    if (revealLeaf) {
      await revealLeaf.call(this.app.workspace, leaf);
      return;
    }
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }
}
