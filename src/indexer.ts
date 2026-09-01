import type { App, TFile } from "obsidian";
import { forEachConcurrent } from "./async-pool";
import { toIsoDate } from "./date";
import { dateFromDailyNotePath } from "./discovery";
import { parseObsidianDateFormat } from "./obsidian-date";
import { parseDailyNote } from "./parser";
import { DaymarkStore } from "./store";
import type { DailyRecord, DaymarkSettings, PeriodAggregate, PeriodBounds, PlainDate } from "./types";
import { markdownFilesInFolder } from "./vault-files";

const INDEX_READ_CONCURRENCY = 8;

export class DaymarkIndex {
  private readonly store = new DaymarkStore();
  private ready = false;
  private rebuilding: Promise<void> | null = null;
  private rebuildRequested = false;

  constructor(
    private readonly app: App,
    private readonly getSettings: () => DaymarkSettings,
    private readonly getLocale: () => string
  ) {}

  aggregate(bounds: PeriodBounds): PeriodAggregate {
    return this.store.aggregate(bounds);
  }

  recordForDate(date: PlainDate): DailyRecord | null {
    return this.store.getByIsoDate(toIsoDate(date));
  }

  get isReady(): boolean {
    return this.ready;
  }

  knownTags(): readonly string[] {
    return this.store.knownTags();
  }

  async ensureReady(): Promise<void> {
    while (!this.ready) {
      if (this.rebuilding) await this.rebuilding;
      else await this.rebuild();
    }
  }

  async rebuild(): Promise<void> {
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
    const parsed = await this.parseFile(file);
    if (parsed) this.store.upsert(parsed);
    else this.store.remove(file.path);
  }

  remove(path: string): void {
    this.store.remove(path);
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
    } while (this.rebuildRequested);
  }

  private async performRebuild(): Promise<void> {
    const settings = this.getSettings();
    const locale = this.getLocale();
    const candidates: Array<{ file: TFile; date: PlainDate }> = [];
    for (const file of markdownFilesInFolder(this.app.vault, settings.journalFolder)) {
      const date = this.dateForPathWithSettings(file.path, settings);
      if (date) candidates.push({ file, date });
    }
    const parsed = new Array<DailyRecord>(candidates.length);
    await forEachConcurrent(candidates, INDEX_READ_CONCURRENCY, async ({ file, date }, index) => {
      parsed[index] = await this.parseFile(file, date, locale);
    }, true);
    this.store.replace(parsed);
    this.ready = true;
  }

  dateForFile(file: TFile): PlainDate | null {
    return this.dateForPath(file.path);
  }

  private dateForPathWithSettings(path: string, settings: DaymarkSettings): PlainDate | null {
    return dateFromDailyNotePath(path, settings.journalFolder, settings.dateFormat, parseObsidianDateFormat);
  }

  private async parseFile(file: TFile, knownDate: PlainDate, locale?: string): Promise<DailyRecord>;
  private async parseFile(file: TFile): Promise<DailyRecord | null>;
  private async parseFile(file: TFile, knownDate?: PlainDate, locale = this.getLocale()): Promise<DailyRecord | null> {
    const date = knownDate ?? this.dateForFile(file);
    if (!date) return null;
    const content = await this.app.vault.cachedRead(file);
    return parseDailyNote(file.path, file.basename, date, content, locale);
  }
}
