import type { App, TFile } from "obsidian";
import { toIsoDate } from "./date";
import { dateFromDailyNotePath } from "./discovery";
import { parseObsidianDateFormat } from "./obsidian-date";
import { parseDailyNote } from "./parser";
import { DaymarkStore } from "./store";
import type { DailyRecord, DaymarkSettings, PeriodAggregate, PeriodBounds, PlainDate } from "./types";

export class DaymarkIndex {
  private readonly store = new DaymarkStore();
  private ready = false;
  private rebuilding: Promise<void> | null = null;

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

  async ensureReady(): Promise<void> {
    if (!this.ready) await this.rebuild();
  }

  async rebuild(): Promise<void> {
    if (this.rebuilding) return this.rebuilding;
    this.rebuilding = this.performRebuild();
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

  private async performRebuild(): Promise<void> {
    const candidates: Array<{ file: TFile; date: PlainDate }> = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const date = this.dateForFile(file);
      if (date) candidates.push({ file, date });
    }
    const parsed = await Promise.all(candidates.map(({ file, date }) => this.parseFile(file, date)));
    this.store.replace(parsed);
    this.ready = true;
  }

  dateForFile(file: TFile): PlainDate | null {
    const settings = this.getSettings();
    return dateFromDailyNotePath(file.path, settings.journalFolder, settings.dateFormat, parseObsidianDateFormat);
  }

  private async parseFile(file: TFile, knownDate: PlainDate): Promise<DailyRecord>;
  private async parseFile(file: TFile): Promise<DailyRecord | null>;
  private async parseFile(file: TFile, knownDate?: PlainDate): Promise<DailyRecord | null> {
    const date = knownDate ?? this.dateForFile(file);
    if (!date) return null;
    const content = await this.app.vault.cachedRead(file);
    return parseDailyNote(file.path, file.basename, date, content, this.getLocale());
  }
}
