import { toIsoDate } from "./date";
import type { PeriodBounds } from "./types";

export interface DaymarkChangeSet {
  full: boolean;
  dailyDates: readonly string[];
  coverDates: readonly string[];
  dailyPaths: readonly string[];
  additionalWords: boolean;
  reportPaths: readonly string[];
}

export type DaymarkChange = Partial<{
  full: boolean;
  dailyDates: Iterable<string>;
  coverDates: Iterable<string>;
  dailyPaths: Iterable<string>;
  additionalWords: boolean;
  reportPaths: Iterable<string>;
}>;

export class DaymarkChangeAccumulator {
  private full = false;
  private readonly dailyDates = new Set<string>();
  private readonly coverDates = new Set<string>();
  private readonly dailyPaths = new Set<string>();
  private additionalWords = false;
  private readonly reportPaths = new Set<string>();

  add(change: DaymarkChange): void {
    this.full ||= change.full === true;
    for (const date of change.dailyDates ?? []) this.dailyDates.add(date);
    for (const date of change.coverDates ?? []) this.coverDates.add(date);
    for (const path of change.dailyPaths ?? []) this.dailyPaths.add(path);
    this.additionalWords ||= change.additionalWords === true;
    for (const path of change.reportPaths ?? []) this.reportPaths.add(path);
  }

  take(): DaymarkChangeSet | null {
    if (!this.full
      && this.dailyDates.size === 0
      && this.coverDates.size === 0
      && this.dailyPaths.size === 0
      && !this.additionalWords
      && this.reportPaths.size === 0) return null;
    const change = {
      full: this.full,
      dailyDates: [...this.dailyDates],
      coverDates: [...this.coverDates],
      dailyPaths: [...this.dailyPaths],
      additionalWords: this.additionalWords,
      reportPaths: [...this.reportPaths]
    };
    this.clear();
    return change;
  }

  private clear(): void {
    this.full = false;
    this.dailyDates.clear();
    this.coverDates.clear();
    this.dailyPaths.clear();
    this.additionalWords = false;
    this.reportPaths.clear();
  }
}

export function changeAffectsBounds(change: DaymarkChangeSet, bounds: PeriodBounds): boolean {
  if (change.full) return true;
  const start = toIsoDate(bounds.start);
  const end = toIsoDate(bounds.end);
  return change.dailyDates.some((date) => date >= start && date < end);
}
