import type { App, TFile } from "obsidian";
import { forEachConcurrent } from "./async-pool";
import { toIsoDate } from "./date";
import { dateFromDailyNotePath } from "./discovery";
import { parseObsidianDateFormat } from "./obsidian-date";
import { parseDailyNote } from "./parser";
import { PathOperationRevisions } from "./sync-scheduler";
import { DaymarkStore } from "./store";
import { LinkedWritingIndex } from "./linked-writing-index";
import type { DailyRecord, DaymarkSettings, PeriodAggregate, PeriodBounds, PlainDate } from "./types";
import { markdownFilesInFolder } from "./vault-files";

const INDEX_READ_CONCURRENCY = 8;

export class DaymarkIndex {
  private readonly store = new DaymarkStore();
  private readonly dailyFiles = new Map<string, TFile>();
  private readonly linkedWriting: LinkedWritingIndex;
  private readonly reads = new PathOperationRevisions();
  private scanChanges: Map<string, { record: DailyRecord; file: TFile } | null> | null = null;
  private ready = false;
  private disposed = false;
  private writingReady: Promise<void> = Promise.resolve();
  private rebuilding: Promise<void> | null = null;
  private rebuildRequested = false;

  constructor(
    private readonly app: App,
    private readonly getSettings: () => DaymarkSettings,
    private readonly getLocale: () => string,
    private readonly onWritingChange: (dates: string[]) => void = () => undefined
  ) {
    this.linkedWriting = new LinkedWritingIndex(app, getLocale, path => this.store.getByPath(path)?.words);
  }

  aggregate(bounds: PeriodBounds): PeriodAggregate {
    return this.store.aggregate(bounds);
  }

  recordForDate(date: PlainDate): DailyRecord | null {
    const record = this.store.getByIsoDate(toIsoDate(date));
    return record && this.getSettings().calendarLayout === "margin"
      ? { ...record, ...this.linkedWriting.summary(record.path), linkedNotes: this.linkedWriting.notesFor(record.path) }
      : record;
  }

  linkedDatesForPath(path: string): string[] {
    return this.linkedWriting.sourcesFor(path).flatMap((source) => {
      const date = this.dateForPath(source);
      return date ? [toIsoDate(date)] : [];
    });
  }

  rebuildMarginWriting(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.getSettings().calendarLayout !== "margin") {
      this.linkedWriting.reset();
      this.writingReady = Promise.resolve();
      return this.writingReady;
    }
    this.writingReady = this.linkedWriting.rebuild([...this.dailyFiles.values()], undefined, sources => {
      const dates = sources.flatMap(path => {
        const date = this.store.getByPath(path)?.date;
        return date ? [toIsoDate(date)] : [];
      });
      if (dates.length) this.onWritingChange(dates);
    });
    return this.writingReady;
  }

  whenWritingReady(): Promise<void> { return this.writingReady; }

  async refreshLinks(file: TFile): Promise<boolean> {
    if (this.getSettings().calendarLayout === "margin" && this.store.has(file.path)) {
      return this.linkedWriting.refreshSource(file);
    }
    return false;
  }

  dispose(): void {
    this.disposed = true;
    this.reads.clear();
    this.scanChanges = null;
    this.rebuildRequested = false;
    this.store.replace([]);
    this.dailyFiles.clear();
    this.ready = false;
    this.linkedWriting.dispose();
  }

  get isReady(): boolean {
    return this.ready;
  }

  knownTags(): readonly string[] {
    return this.store.knownTags();
  }

  async ensureReady(): Promise<void> {
    while (!this.ready && !this.disposed) {
      if (this.rebuilding) await this.rebuilding;
      else await this.rebuild();
    }
  }

  async rebuild(): Promise<void> {
    if (this.disposed) return;
    if (this.rebuilding) {
      this.rebuildRequested = true;
      return this.rebuilding;
    }
    this.rebuilding = this.runRebuilds();
    try {
      await this.rebuilding;
    } finally {
      this.rebuilding = null;
    }
  }

  async refresh(file: TFile): Promise<void> {
    if (this.disposed) return;
    const path = file.path;
    const operation = { path, sequence: this.reads.issue(path) };
    const settings = this.getSettings();
    try {
      const parsed = await this.parseFile(file);
      if (this.disposed || !this.reads.isCurrent(operation) || path !== file.path || !this.sourceIsCurrent(settings)) return;
      this.scanChanges?.set(path, parsed ? { record: parsed, file } : null);
      if (parsed) {
        this.store.upsert(parsed);
        this.dailyFiles.set(path, file);
      } else {
        this.store.remove(path);
        this.dailyFiles.delete(path);
        this.linkedWriting.removeSource(path);
      }
      if (this.getSettings().calendarLayout === "margin") {
        await this.linkedWriting.refreshTarget(file, parsed?.words);
        if (parsed && this.reads.isCurrent(operation) && path === file.path) await this.linkedWriting.refreshSource(file);
      }
    } finally { this.reads.complete(operation); }
  }

  remove(path: string): void {
    this.reads.invalidate(path);
    this.scanChanges?.set(path, null);
    this.store.remove(path);
    this.dailyFiles.delete(path);
    this.linkedWriting.remove(path);
  }

  has(path: string): boolean {
    return this.store.has(path);
  }

  matches(file: TFile): boolean {
    return this.dateForFile(file) !== null;
  }

  dateForPath(path: string): PlainDate | null {
    return this.dateForPathWithSettings(path, this.getSettings());
  }

  private async runRebuilds(): Promise<void> {
    do {
      this.rebuildRequested = false;
      await this.performRebuild();
    } while (this.rebuildRequested && !this.disposed);
  }

  private async performRebuild(): Promise<void> {
    const settings = this.getSettings();
    const locale = this.getLocale();
    const candidates: Array<{ file: TFile; date: PlainDate; path: string }> = [];
    for (const file of markdownFilesInFolder(this.app.vault, settings.journalFolder)) {
      const date = this.dateForPathWithSettings(file.path, settings);
      if (date) candidates.push({ file, date, path: file.path });
    }
    const parsed = new Array<DailyRecord | null>(candidates.length);
    const current = (): boolean => !this.disposed && this.sourceIsCurrent(settings);
    const changes = this.scanChanges = new Map<string, { record: DailyRecord; file: TFile } | null>();
    try {
      await forEachConcurrent(candidates, INDEX_READ_CONCURRENCY, async ({ file, date, path }, index) => {
        parsed[index] = file.path === path ? await this.parseFile(file, date, locale) : null;
      }, true, current);
    } finally { if (this.scanChanges === changes) this.scanChanges = null; }
    if (this.disposed) return;
    if (!current()) { this.rebuildRequested = true; return; }
    // Overlay edits/removals that completed during the scan, without rereading it.
    const records = new Map<string, DailyRecord>();
    this.dailyFiles.clear();
    candidates.forEach(({ file, path }, index) => {
      const record = parsed[index];
      if (!record || file.path !== path) return;
      records.set(path, record);
      this.dailyFiles.set(path, file);
    });
    for (const [path, update] of changes) {
      if (update && update.file.path === path) {
        records.set(path, update.record);
        this.dailyFiles.set(path, update.file);
      } else { records.delete(path); this.dailyFiles.delete(path); }
    }
    this.store.replace(records.values());
    void this.rebuildMarginWriting().catch((error: unknown) => {
      console.error("Daymark could not finish indexing linked writing.", error);
    });
    this.ready = true;
  }

  dateForFile(file: TFile): PlainDate | null {
    return this.dateForPath(file.path);
  }

  private dateForPathWithSettings(path: string, settings: DaymarkSettings): PlainDate | null {
    return dateFromDailyNotePath(path, settings.journalFolder, settings.dateFormat, parseObsidianDateFormat);
  }

  private sourceIsCurrent(settings: DaymarkSettings): boolean {
    const current = this.getSettings();
    return settings.journalFolder === current.journalFolder && settings.dateFormat === current.dateFormat;
  }

  private async parseFile(file: TFile, knownDate?: PlainDate, locale = this.getLocale()): Promise<DailyRecord | null> {
    const date = knownDate ?? this.dateForFile(file);
    if (!date) return null;
    const path = file.path, basename = file.basename;
    const content = await this.app.vault.cachedRead(file);
    if (this.disposed || file.path !== path) return null;
    return parseDailyNote(path, basename, date, content, locale);
  }
}
