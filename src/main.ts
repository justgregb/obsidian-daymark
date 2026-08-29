import { normalizePath, Notice, Platform, Plugin, TFile, TFolder, type TAbstractFile, type WorkspaceLeaf } from "obsidian";
import { AdditionalWordIndex, pathIsInAdditionalWordFolder } from "./additional-word-index";
import { forEachConcurrent } from "./async-pool";
import { DAYMARK_CALENDAR_VIEW_TYPE, DaymarkCalendarView } from "./calendar-view";
import {
  DaymarkChangeAccumulator,
  type DaymarkChange,
  type DaymarkChangeSet
} from "./change-set";
import { confirmDailyNoteCreation } from "./create-note-modal";
import { dailyNotePath, renderDailyNoteTemplate } from "./daily-note";
import { parseIsoDate, todayPlainDate, toIsoDate } from "./date";
import {
  createDiagnosticsReport,
  monotonicNow,
  type SyncBatchDiagnostics
} from "./diagnostics";
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
import { PathOperationRevisions, prioritizeOperations } from "./sync-scheduler";
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

interface PendingFileOperation {
  path: string;
  sequence: number;
  kind: "refresh" | "remove";
  contentChanged: boolean;
  dailyDates: Set<string>;
  touchesDailyNotes: boolean;
  touchesAdditionalWords: boolean;
  reportPaths: Set<string>;
}

const SYNC_BATCH_QUIET_MS = 250;
const SYNC_BATCH_MAX_MS = 900;
const SYNC_REFRESH_CONCURRENCY = 6;
const MAX_RECENT_SYNC_BATCHES = 8;

export default class DaymarkPlugin extends Plugin {
  override settings: DaymarkSettings = {
    ...DEFAULT_SETTINGS,
    tallyMetricLabels: {},
    tallyTagLabels: {}
  };
  index!: DaymarkIndex;
  additionalWordIndex!: AdditionalWordIndex;
  private readonly listeners = new Set<(change: DaymarkChangeSet) => void>();
  private readonly pendingFileOperations = new Map<string, PendingFileOperation>();
  private readonly operationRevisions = new PathOperationRevisions();
  private readonly recentSyncBatches: SyncBatchDiagnostics[] = [];
  private coalescedOperationCount = 0;
  private syncBatchTimer: number | null = null;
  private syncBatchStartedAt: number | null = null;
  private syncBatchChain = Promise.resolve();
  private additionalWordLoad: Promise<void> | null = null;
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
      () => this.usesAdditionalWordIndex() ? this.settings.additionalWordFolder : "",
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
      id: "copy-diagnostics",
      name: "Copy diagnostics",
      callback: () => {
        void this.copyDiagnostics();
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
    if (this.syncBatchTimer !== null) window.clearTimeout(this.syncBatchTimer);
    this.pendingFileOperations.clear();
    this.operationRevisions.clear();
    if (this.rebuildTimer !== null) window.clearTimeout(this.rebuildTimer);
    if (this.additionalWordRebuildTimer !== null) window.clearTimeout(this.additionalWordRebuildTimer);
    this.listeners.clear();
  }

  subscribe(listener: (change: DaymarkChangeSet) => void): () => void {
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
    if (!rebuildDailyNotes && !rebuildAdditionalWords) this.emitChange({ full: true });
  }

  async rebuildIndex(): Promise<void> {
    const rebuilds = [this.index.rebuild()];
    if (this.usesAdditionalWordIndex()) rebuilds.push(this.additionalWordIndex.rebuild());
    await Promise.all(rebuilds);
    this.emitChange({ full: true });
  }

  async ensureCalendarReady(): Promise<void> {
    await this.index.ensureReady();
  }

  async ensureAdditionalWordsReady(): Promise<void> {
    if (!this.usesAdditionalWordIndex() || this.additionalWordIndex.isReady) return;
    if (this.additionalWordLoad) return this.additionalWordLoad;
    this.additionalWordLoad = this.additionalWordIndex.ensureReady().then(() => {
      this.emitChange({ additionalWords: true });
    }).finally(() => {
      this.additionalWordLoad = null;
    });
    return this.additionalWordLoad;
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
    this.registerEvent(this.app.vault.on("create", (file) => this.queueRefresh(file)));
    this.registerEvent(this.app.vault.on("modify", (file) => this.queueRefresh(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.queueRemoval(file)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.queueRename(file, oldPath)));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => this.queueMetadataRefresh(file)));
  }

  private queueRefresh(file: TAbstractFile): void {
    if (!(file instanceof TFile)) return;
    this.queueFileOperation(file.path, "refresh", true);
  }

  private queueMetadataRefresh(file: TFile): void {
    this.queueFileOperation(file.path, "refresh", false, true);
  }

  private queueRemoval(file: TAbstractFile): void {
    if (!(file instanceof TFile)) {
      this.scheduleRebuild();
      if (this.usesAdditionalWordIndex()) this.scheduleAdditionalWordRebuild();
      return;
    }
    this.queueFileOperation(file.path, "remove", true);
  }

  private queueRename(file: TAbstractFile, oldPath: string): void {
    if (!(file instanceof TFile)) {
      this.scheduleRebuild();
      if (this.usesAdditionalWordIndex()) this.scheduleAdditionalWordRebuild();
      return;
    }
    this.queueFileOperation(oldPath, "remove", true);
    this.queueFileOperation(file.path, "refresh", true);
  }

  private queueFileOperation(
    path: string,
    kind: PendingFileOperation["kind"],
    contentChanged: boolean,
    dailyOnly = false
  ): void {
    const date = this.index.dateForPath(path);
    const dailyDates = date ? [toIsoDate(date)] : [];
    const touchesDailyNotes = date !== null || this.index.has(path);
    const touchesAdditionalWords = !dailyOnly && (this.additionalWordIndex.has(path)
      || (this.usesAdditionalWordIndex()
        && pathIsInAdditionalWordFolder(path, this.settings.additionalWordFolder)));
    const reportPath = !dailyOnly && this.matchesSummaryPath(path) ? path : null;
    if (!touchesDailyNotes && !touchesAdditionalWords && !reportPath) return;
    const sequence = this.operationRevisions.issue(path);

    let operation = this.pendingFileOperations.get(path);
    if (!operation) {
      operation = {
        path,
        sequence,
        kind,
        contentChanged,
        dailyDates: new Set(),
        touchesDailyNotes: false,
        touchesAdditionalWords: false,
        reportPaths: new Set()
      };
      this.pendingFileOperations.set(path, operation);
    } else {
      this.coalescedOperationCount += 1;
    }
    operation.sequence = sequence;
    operation.kind = kind;
    operation.contentChanged ||= contentChanged;
    for (const isoDate of dailyDates) operation.dailyDates.add(isoDate);
    operation.touchesDailyNotes ||= touchesDailyNotes;
    operation.touchesAdditionalWords ||= touchesAdditionalWords;
    if (reportPath) operation.reportPaths.add(reportPath);
    this.scheduleFileBatch();
  }

  private scheduleFileBatch(): void {
    const now = Date.now();
    this.syncBatchStartedAt ??= now;
    if (this.syncBatchTimer !== null) window.clearTimeout(this.syncBatchTimer);
    const elapsed = now - this.syncBatchStartedAt;
    const delay = Math.max(0, Math.min(SYNC_BATCH_QUIET_MS, SYNC_BATCH_MAX_MS - elapsed));
    this.syncBatchTimer = window.setTimeout(() => this.startFileBatch(), delay);
  }

  private startFileBatch(): void {
    this.syncBatchTimer = null;
    this.syncBatchStartedAt = null;
    const operations = [...this.pendingFileOperations.values()];
    this.pendingFileOperations.clear();
    if (operations.length === 0) return;
    this.syncBatchChain = this.syncBatchChain
      .then(() => this.processFileBatch(operations))
      .catch((error: unknown) => {
        console.error("Daymark could not process an indexed-note batch.", error);
      });
  }

  private async processFileBatch(operations: readonly PendingFileOperation[]): Promise<void> {
    const startedAt = monotonicNow();
    const changes = new DaymarkChangeAccumulator();
    const prioritized = this.prioritizeFileOperations(operations);
    let processedCount = 0;
    let supersededCount = 0;
    await forEachConcurrent(prioritized, SYNC_REFRESH_CONCURRENCY, async (operation) => {
      const operationChanges = new DaymarkChangeAccumulator();
      const processed = await this.processFileOperation(operation, operationChanges);
      if (!processed) {
        supersededCount += 1;
        return;
      }
      processedCount += 1;
      const change = operationChanges.take();
      if (change) changes.add(change);
      this.operationRevisions.complete(operation);
    }, true);
    const change = changes.take();
    if (change) this.emitChange(change);
    this.recordSyncBatch({
      operationCount: operations.length,
      processedCount,
      supersededCount,
      durationMs: monotonicNow() - startedAt
    });
  }

  private async processFileOperation(
    operation: PendingFileOperation,
    changes: DaymarkChangeAccumulator
  ): Promise<boolean> {
    if (!this.operationRevisions.isCurrent(operation)) return false;
    const current = operation.kind === "refresh"
      ? this.app.vault.getAbstractFileByPath(operation.path)
      : null;
    const file = current instanceof TFile ? current : null;
    const currentDate = file ? this.index.dateForFile(file) : null;
    if (operation.touchesDailyNotes || currentDate) {
      try {
        if (operation.contentChanged || operation.kind === "remove") {
          if (file) await this.index.refresh(file);
          else this.index.remove(operation.path);
        }
        if (!this.operationRevisions.isCurrent(operation)) return false;
        if (currentDate) operation.dailyDates.add(toIsoDate(currentDate));
        changes.add(operation.contentChanged || operation.kind === "remove"
          ? { dailyDates: operation.dailyDates, dailyPaths: [operation.path] }
          : { coverDates: operation.dailyDates, dailyPaths: [operation.path] });
      } catch (error) {
        console.error(`Daymark could not refresh ${operation.path} in the daily-note index.`, error);
      }
    }

    const currentAdditional = file
      && this.usesAdditionalWordIndex()
      && pathIsInAdditionalWordFolder(file.path, this.settings.additionalWordFolder);
    if (operation.contentChanged && (operation.touchesAdditionalWords || currentAdditional)) {
      try {
        if (file && currentAdditional) await this.additionalWordIndex.refresh(file);
        else this.additionalWordIndex.remove(operation.path);
        if (!this.operationRevisions.isCurrent(operation)) return false;
        changes.add({ additionalWords: true });
      } catch (error) {
        console.error(`Daymark could not refresh ${operation.path} in the additional word index.`, error);
      }
    }

    if (this.matchesSummaryPath(operation.path)) operation.reportPaths.add(operation.path);
    if (operation.reportPaths.size > 0) changes.add({ reportPaths: operation.reportPaths });
    return this.operationRevisions.isCurrent(operation);
  }

  private prioritizeFileOperations(operations: readonly PendingFileOperation[]): PendingFileOperation[] {
    const activePath = this.app.workspace.getActiveFile()?.path;
    const calendarViews = this.app.workspace.getLeavesOfType(DAYMARK_CALENDAR_VIEW_TYPE)
      .map((leaf) => leaf.view)
      .filter((view): view is DaymarkCalendarView => view instanceof DaymarkCalendarView);
    return prioritizeOperations(operations, (operation) => {
      if (operation.path === activePath) return 0;
      let priority = 3;
      for (const view of calendarViews) {
        priority = Math.min(priority, view.syncPriorityForDates(operation.dailyDates) + 1);
      }
      return priority;
    });
  }

  private recordSyncBatch(batch: SyncBatchDiagnostics): void {
    this.recentSyncBatches.push(batch);
    if (this.recentSyncBatches.length > MAX_RECENT_SYNC_BATCHES) this.recentSyncBatches.shift();
  }

  private async copyDiagnostics(): Promise<void> {
    const report = createDiagnosticsReport({
      version: this.manifest.version,
      platform: Platform.isMobile ? "mobile" : "desktop",
      dailyIndex: this.index.diagnostics,
      additionalIndex: this.additionalWordIndex.diagnostics,
      additionalIndexEnabled: this.usesAdditionalWordIndex(),
      pendingOperationCount: this.pendingFileOperations.size,
      coalescedOperationCount: this.coalescedOperationCount,
      recentSyncBatches: this.recentSyncBatches
    });
    try {
      await navigator.clipboard.writeText(report);
      new Notice("Daymark diagnostics copied.");
    } catch (error) {
      console.error("Daymark could not copy its local diagnostics.", error);
      new Notice("Daymark could not copy diagnostics to the clipboard.");
    }
  }

  private scheduleRebuild(): void {
    if (this.rebuildTimer !== null) window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => {
      this.rebuildTimer = null;
      void this.index.rebuild().then(() => this.emitChange({ full: true })).catch((error: unknown) => {
        console.error("Daymark could not rebuild its daily-note index.", error);
      });
    }, 400);
  }

  private scheduleAdditionalWordRebuild(delay = 400): void {
    if (this.additionalWordRebuildTimer !== null) window.clearTimeout(this.additionalWordRebuildTimer);
    this.additionalWordRebuildTimer = window.setTimeout(() => {
      this.additionalWordRebuildTimer = null;
      void this.additionalWordIndex.rebuild().then(() => this.emitChange({ additionalWords: true })).catch((error: unknown) => {
        console.error("Daymark could not rebuild its additional word-count index.", error);
      });
    }, delay);
  }

  private emitChange(change: DaymarkChange): void {
    const accumulator = new DaymarkChangeAccumulator();
    accumulator.add(change);
    const normalized = accumulator.take();
    if (!normalized) return;
    if (normalized.full || normalized.dailyDates.length > 0 || normalized.reportPaths.length > 0) {
      this.summaryStates = new WeakMap();
    }
    for (const listener of this.listeners) listener(normalized);
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
