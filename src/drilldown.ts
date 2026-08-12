import {
  compareDates,
  formatBreakdownDay,
  formatBreakdownMonth,
  formatBreakdownRange,
  getPeriodBounds,
  toIsoDate
} from "./date";
import type { PeriodBounds, PeriodMode, PlainDate, Weekday } from "./types";

export interface BreakdownSource {
  date: PlainDate;
  isoDate: string;
  path: string;
  value: number;
  line?: number;
}

export interface BreakdownRow {
  key: string;
  label: string;
  value: number;
  path: string | null;
  line: number | null;
}

function laterDate(left: PlainDate, right: PlainDate): PlainDate {
  return compareDates(left, right) >= 0 ? left : right;
}

function earlierDate(left: PlainDate, right: PlainDate): PlainDate {
  return compareDates(left, right) <= 0 ? left : right;
}

export function buildBreakdownRows(
  sources: BreakdownSource[],
  mode: PeriodMode,
  parentBounds: PeriodBounds,
  weekStart: Weekday,
  locale?: string
): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();

  for (const source of sources) {
    let key: string;
    let label: string;
    let path: string | null = null;
    let line: number | null = null;

    if (mode === "year") {
      const month = { year: source.date.year, month: source.date.month, day: 1 };
      key = toIsoDate(month);
      label = formatBreakdownMonth(month, locale);
    } else if (mode === "month") {
      const week = getPeriodBounds(source.date, "week", weekStart);
      const start = laterDate(week.start, parentBounds.start);
      const end = earlierDate(week.end, parentBounds.end);
      key = toIsoDate(week.start);
      label = formatBreakdownRange(start, end, locale);
    } else {
      key = source.isoDate;
      label = formatBreakdownDay(source.date, locale);
      path = source.path;
      line = source.line ?? null;
    }

    const existing = rows.get(key);
    if (existing) {
      existing.value += source.value;
    } else {
      rows.set(key, { key, label, value: source.value, path, line });
    }
  }

  return [...rows.values()].sort((left, right) => right.key.localeCompare(left.key));
}
