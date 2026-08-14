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

type BreakdownPeriod =
  | { mode: "year"; key: string }
  | { mode: "month"; key: string; week: PeriodBounds }
  | { mode: "week"; key: string };

function laterDate(left: PlainDate, right: PlainDate): PlainDate {
  return compareDates(left, right) >= 0 ? left : right;
}

function earlierDate(left: PlainDate, right: PlainDate): PlainDate {
  return compareDates(left, right) <= 0 ? left : right;
}

function breakdownPeriod(
  source: Pick<BreakdownSource, "date" | "isoDate">,
  mode: PeriodMode,
  weekStart: Weekday
): BreakdownPeriod {
  if (mode === "year") {
    return {
      mode,
      key: toIsoDate({ year: source.date.year, month: source.date.month, day: 1 })
    };
  }
  if (mode === "month") {
    const week = getPeriodBounds(source.date, "week", weekStart);
    return { mode, key: toIsoDate(week.start), week };
  }
  return { mode, key: source.isoDate };
}

export function sumBreakdownValues(
  sources: BreakdownSource[],
  mode: PeriodMode,
  weekStart: Weekday
): Map<string, number> {
  const values = new Map<string, number>();
  for (const source of sources) {
    const { key } = breakdownPeriod(source, mode, weekStart);
    values.set(key, (values.get(key) ?? 0) + source.value);
  }
  return values;
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
    const period = breakdownPeriod(source, mode, weekStart);
    const key = period.key;
    let label: string;
    let path: string | null = null;
    let line: number | null = null;

    if (period.mode === "year") {
      const month = { year: source.date.year, month: source.date.month, day: 1 };
      label = formatBreakdownMonth(month, locale);
    } else if (period.mode === "month") {
      const week = period.week;
      const start = laterDate(week.start, parentBounds.start);
      const end = earlierDate(week.end, parentBounds.end);
      label = formatBreakdownRange(start, end, locale);
    } else {
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

  return [...rows.values()].sort((left, right) => left.key.localeCompare(right.key));
}
