import { moment, normalizePath, Notice, Plugin, TFile, TFolder, type TAbstractFile, type WorkspaceLeaf } from "obsidian";
import { AdditionalWordIndex } from "./additional-word-index";
import { DAYMARK_CALENDAR_VIEW_TYPE, DaymarkCalendarView } from "./calendar-view";
import { confirmDailyNoteCreation } from "./create-note-modal";
import { dailyNotePath, renderDailyNoteTemplate } from "./daily-note";
import { DaymarkIndex } from "./indexer";
import { isValidObsidianDateFormat } from "./obsidian-date";
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
import { TALLY_VIEW_TYPE, TallyView } from "./view";
import { normalizeHighlightedWeekdays, normalizeWeekStartSetting, resolveWeekStartSetting } from "./week-start";

export default class DaymarkPlugin extends Plugin {
  override settings: DaymarkSettings = { ...DEFAULT_SETTINGS };
  index!: DaymarkIndex;
  additionalWordIndex!: AdditionalWordIndex;
  private readonly listeners = new Set<() => void>();
  private readonly refreshTimers = new Map<string, number>();
  private rebuildTimer: number | null = null;
  private additionalWordRebuildTimer: number | null = null;

  get locale(): string {
    return moment.locale();
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
    this.registerView(TALLY_VIEW_TYPE, (leaf: WorkspaceLeaf) => new TallyView(leaf, this));
    this.addRibbonIcon("calendar-days", "Open Daymark", () => {
      void this.openCalendarView();
    });
    this.addCommand({
      id: "open-calendar",
      name: "Open Daymark",
      callback: () => {
        void this.openCalendarView();
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
      if (!this.settings.tallyEnabled) this.app.workspace.detachLeavesOfType(TALLY_VIEW_TYPE);
      void this.migrateExistingSidebar();
    });
  }

  override onunload(): void {
    for (const timer of this.refreshTimers.values()) window.clearTimeout(timer);
    this.refreshTimers.clear();
    if (this.rebuildTimer !== null) window.clearTimeout(this.rebuildTimer);
    if (this.additionalWordRebuildTimer !== null) window.clearTimeout(this.additionalWordRebuildTimer);
    this.listeners.clear();
    this.app.workspace.detachLeavesOfType(DAYMARK_CALENDAR_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(TALLY_VIEW_TYPE);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  resolveWeekStart(): Weekday {
    return resolveWeekStartSetting(this.settings.weekStart, moment.localeData().firstDayOfWeek());
  }

  resolveLocaleWeekStart(): Weekday {
    return resolveWeekStartSetting("locale", moment.localeData().firstDayOfWeek());
  }

  async updateSettings(change: Partial<DaymarkSettings>): Promise<void> {
    const previous = this.settings;
    const requestedDateFormat = change.dateFormat?.trim();
    const next: DaymarkSettings = {
      ...this.settings,
      ...change,
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
        : normalizeTemplatePath(change.templatePath)
    };
    if (settingsAreEqual(previous, next)) return;
    this.settings = next;
    await this.saveData(next);
    if (previous.tallyEnabled && !next.tallyEnabled) {
      this.app.workspace.detachLeavesOfType(TALLY_VIEW_TYPE);
    }
    const rebuildDailyNotes = settingsRequireRebuild(previous, next);
    const rebuildAdditionalWords = settingsRequireAdditionalWordRebuild(previous, next);
    if (rebuildDailyNotes) this.scheduleRebuild();
    if (rebuildAdditionalWords) this.scheduleAdditionalWordRebuild();
    if (!rebuildDailyNotes && !rebuildAdditionalWords) this.emitChange();
  }

  async rebuildIndex(): Promise<void> {
    await Promise.all([this.index.rebuild(), this.additionalWordIndex.rebuild()]);
    this.emitChange();
  }

  async ensureTallyReady(): Promise<void> {
    await Promise.all([this.index.ensureReady(), this.additionalWordIndex.ensureReady()]);
  }

  async openOrCreateDailyNote(date: PlainDate): Promise<void> {
    try {
      await this.index.ensureReady();
      const indexed = this.index.recordForDate(date);
      let file = indexed ? this.app.vault.getAbstractFileByPath(indexed.path) : null;
      if (!(file instanceof TFile)) {
        const path = dailyNotePath(this.settings.journalFolder, this.settings.dateFormat, date);
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (existing instanceof TFolder) throw new Error(`A folder already exists at ${path}.`);
        if (existing instanceof TFile) {
          file = existing;
        } else {
          const confirmed = await confirmDailyNoteCreation(this.app, date, path, this.locale);
          if (!confirmed) return;
          const confirmedExisting = this.app.vault.getAbstractFileByPath(path);
          if (confirmedExisting instanceof TFolder) throw new Error(`A folder already exists at ${path}.`);
          if (confirmedExisting instanceof TFile) {
            file = confirmedExisting;
          } else {
            const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
            await this.ensureFolder(folder);
            const content = await this.dailyNoteContent(date);
            file = await this.app.vault.create(path, content);
          }
        }
      }
      if (!(file instanceof TFile)) throw new Error("Daymark could not resolve the daily note file.");
      await this.app.workspace.getLeaf(false).openFile(file);
    } catch (error) {
      console.error("Daymark could not open the daily note.", error);
      new Notice(error instanceof Error ? error.message : "Daymark could not open the daily note.");
    }
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
        await this.app.vault.process(existing, (currentContent) => {
          if (!isGeneratedTallySummary(currentContent)) {
            throw new Error(`Tally will not overwrite ${summary.path} because it was not generated by Tally.`);
          }
          return getSavedSummaryState(currentContent, summary.content) === "saved"
            ? currentContent
            : summary.content;
        });
      }
    } else {
      await this.app.vault.create(summary.path, summary.content);
    }
    return summary.path;
  }

  async summaryState(mode: PeriodMode, aggregate: PeriodAggregate): Promise<SavedSummaryState> {
    const summary = this.summaryDescriptor(mode, aggregate);
    const existing = this.app.vault.getAbstractFileByPath(summary.path);
    if (!(existing instanceof TFile)) return "save";
    return getSavedSummaryState(await this.app.vault.cachedRead(existing), summary.content);
  }

  private async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<DaymarkSettings> | null;
    const dateFormat = stored?.dateFormat ?? DEFAULT_SETTINGS.dateFormat;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      dateFormat: isValidObsidianDateFormat(dateFormat) ? dateFormat : DEFAULT_SETTINGS.dateFormat,
      highlightedWeekdays: normalizeHighlightedWeekdays(stored?.highlightedWeekdays),
      additionalWordFolder: normalizeAdditionalWordFolder(
        stored?.additionalWordFolder ?? DEFAULT_SETTINGS.additionalWordFolder
      ),
      journalFolder: normalizeJournalFolder(stored?.journalFolder ?? DEFAULT_SETTINGS.journalFolder),
      templatePath: normalizeTemplatePath(stored?.templatePath ?? DEFAULT_SETTINGS.templatePath),
      weekStart: normalizeWeekStartSetting(stored?.weekStart)
    };
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
    const refreshAdditionalWords = this.additionalWordIndex.matches(file);
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
      this.scheduleAdditionalWordRebuild();
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
      this.scheduleAdditionalWordRebuild();
      return;
    }
    if (this.index.matches(file) || this.additionalWordIndex.matches(file)) this.scheduleRefresh(file);
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

  private scheduleAdditionalWordRebuild(): void {
    if (this.additionalWordRebuildTimer !== null) window.clearTimeout(this.additionalWordRebuildTimer);
    this.additionalWordRebuildTimer = window.setTimeout(() => {
      this.additionalWordRebuildTimer = null;
      void this.additionalWordIndex.rebuild().then(() => this.emitChange()).catch((error: unknown) => {
        console.error("Daymark could not rebuild its additional word-count index.", error);
      });
    }, 400);
  }

  private emitChange(): void {
    for (const listener of this.listeners) listener();
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
    return createSavedSummaryDescriptor(
      this.settings.journalFolder,
      mode,
      aggregate,
      this.resolveWeekStart(),
      this.locale
    );
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
    await view?.saveCurrentPeriod();
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
    await this.app.workspace.revealLeaf(leaf);
    return leaf.view instanceof DaymarkCalendarView ? leaf.view : null;
  }

  async openTallyView(): Promise<TallyView | null> {
    if (!this.settings.tallyEnabled) {
      new Notice("Tally is disabled in Daymark settings.");
      return null;
    }
    const existing = this.app.workspace.getLeavesOfType(TALLY_VIEW_TYPE);
    let leaf = existing.find((candidate) => candidate.getRoot() === this.app.workspace.rightSplit);
    if (leaf) {
      for (const candidate of existing) {
        if (candidate !== leaf) candidate.detach();
      }
    }
    if (!leaf) {
      const savedState = existing[0]?.view instanceof TallyView ? existing[0].view.getState() : undefined;
      this.app.workspace.detachLeavesOfType(TALLY_VIEW_TYPE);
      leaf = this.app.workspace.getRightLeaf(true) ?? undefined;
      if (!leaf) {
        new Notice("Daymark could not open Tally in the right sidebar.");
        return null;
      }
      await leaf.setViewState({ type: TALLY_VIEW_TYPE, active: true, state: savedState });
    }
    await this.app.workspace.revealLeaf(leaf);
    return leaf.view instanceof TallyView ? leaf.view : null;
  }

  private async migrateExistingSidebar(): Promise<void> {
    if (this.app.workspace.getLeavesOfType(DAYMARK_CALENDAR_VIEW_TYPE).length > 0) {
      await this.openCalendarView();
      return;
    }
    const tallyLeaves = this.app.workspace.getLeavesOfType(TALLY_VIEW_TYPE);
    const leaf = tallyLeaves.find((candidate) => candidate.getRoot() === this.app.workspace.rightSplit);
    if (!leaf) return;
    for (const candidate of tallyLeaves) {
      if (candidate !== leaf) candidate.detach();
    }
    await leaf.setViewState({ type: DAYMARK_CALENDAR_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
}
