import { dateTimeFormatter } from "./intl-cache";
import type { PeriodBounds, PeriodMode, PlainDate, Weekday } from "./types";

const DATE_TOKENS = ["YYYY", "MM", "DD"] as const;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDateRegex(format: string): RegExp | null {
  if (!isSupportedDateFormat(format)) return null;

  let source = "^";
  let cursor = 0;
  const tokenRegex = /(YYYY|MM|DD)/g;
  for (const match of format.matchAll(tokenRegex)) {
    const index = match.index;
    const token = match[0];
    source += escapeRegex(format.slice(cursor, index));
    if (token === "YYYY") source += "(?<year>\\d{4})";
    if (token === "MM") source += "(?<month>\\d{2})";
    if (token === "DD") source += "(?<day>\\d{2})";
    cursor = index + token.length;
  }
  source += `${escapeRegex(format.slice(cursor))}$`;
  return new RegExp(source);
}

export function isSupportedDateFormat(format: string): boolean {
  if (format.length === 0) return false;
  return DATE_TOKENS.every((token) => format.split(token).length === 2);
}

export function parseDateFromBasename(basename: string, format: string): PlainDate | null {
  const regex = buildDateRegex(format);
  const groups = regex?.exec(basename)?.groups;
  if (!groups) return null;

  const date: PlainDate = {
    year: Number(groups.year),
    month: Number(groups.month),
    day: Number(groups.day)
  };
  return isValidDate(date) ? date : null;
}

export function isValidDate(date: PlainDate): boolean {
  const value = toDate(date);
  return value.getUTCFullYear() === date.year
    && value.getUTCMonth() + 1 === date.month
    && value.getUTCDate() === date.day;
}

export function toDate(date: PlainDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

export function fromDate(date: Date): PlainDate {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

export function toIsoDate(date: PlainDate): string {
  const year = String(date.year).padStart(4, "0");
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(value: string): PlainDate | null {
  return parseDateFromBasename(value, "YYYY-MM-DD");
}

export function todayPlainDate(now = new Date()): PlainDate {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate()
  };
}

export function addDays(date: PlainDate, days: number): PlainDate {
  const value = toDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return fromDate(value);
}

export function shiftAnchor(date: PlainDate, mode: PeriodMode, amount: number): PlainDate {
  if (mode === "week") return addDays(date, 7 * amount);

  const targetYear = mode === "year" ? date.year + amount : date.year;
  const targetMonthIndex = mode === "month" ? date.month - 1 + amount : date.month - 1;
  const first = new Date(Date.UTC(targetYear, targetMonthIndex, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth() + 1;
  const finalDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day: Math.min(date.day, finalDay) };
}

function sortableDateValue(date: PlainDate): number {
  return date.year * 10_000 + date.month * 100 + date.day;
}

export function compareDates(left: PlainDate, right: PlainDate): number {
  return sortableDateValue(left) - sortableDateValue(right);
}

export function datesEqual(left: PlainDate, right: PlainDate): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

export function getPeriodBounds(anchor: PlainDate, mode: PeriodMode, weekStart: Weekday): PeriodBounds {
  if (mode === "week") {
    const weekday = toDate(anchor).getUTCDay() as Weekday;
    const offset = (weekday - weekStart + 7) % 7;
    const start = addDays(anchor, -offset);
    return { start, end: addDays(start, 7) };
  }

  if (mode === "month") {
    const start = { year: anchor.year, month: anchor.month, day: 1 };
    return { start, end: shiftAnchor(start, "month", 1) };
  }

  return {
    start: { year: anchor.year, month: 1, day: 1 },
    end: { year: anchor.year + 1, month: 1, day: 1 }
  };
}

export function dateIsWithin(date: PlainDate, bounds: PeriodBounds): boolean {
  const value = sortableDateValue(date);
  return value >= sortableDateValue(bounds.start) && value < sortableDateValue(bounds.end);
}

function formatDate(date: PlainDate, options: Intl.DateTimeFormatOptions, locale?: string): string {
  return dateTimeFormatter(locale, { ...options, timeZone: "UTC" }).format(toDate(date));
}

export function formatPeriodTitle(bounds: PeriodBounds, mode: PeriodMode, locale?: string): string {
  if (mode === "year") return String(bounds.start.year);
  if (mode === "month") {
    return formatDate(bounds.start, { month: "short", year: "numeric" }, locale);
  }

  const last = addDays(bounds.end, -1);
  const compactYear = `’${String(last.year).slice(-2)}`;
  if (bounds.start.year !== last.year) {
    const start = formatDate(bounds.start, { month: "short", day: "numeric" }, locale);
    const end = formatDate(last, { month: "short", day: "numeric" }, locale);
    return `${start}–${end} ${compactYear}`;
  }
  if (bounds.start.month !== last.month) {
    const start = formatDate(bounds.start, { month: "short", day: "numeric" }, locale);
    const end = formatDate(last, { month: "short", day: "numeric" }, locale);
    return `${start}–${end} ${compactYear}`;
  }
  const month = formatDate(bounds.start, { month: "short" }, locale);
  return `${month} ${bounds.start.day}–${last.day} ${compactYear}`;
}

export function formatSourceDate(date: PlainDate, locale?: string): string {
  return formatDate(date, { month: "short", day: "numeric", year: "numeric" }, locale);
}

export function formatBreakdownDay(date: PlainDate, locale?: string): string {
  return formatDate(date, { weekday: "short", month: "short", day: "numeric" }, locale);
}

export function formatBreakdownMonth(date: PlainDate, locale?: string): string {
  return formatDate(date, { month: "short" }, locale);
}

export function formatBreakdownRange(start: PlainDate, end: PlainDate, locale?: string): string {
  const last = addDays(end, -1);
  if (start.year !== last.year) {
    const firstLabel = formatDate(start, { month: "short", day: "numeric", year: "numeric" }, locale);
    const lastLabel = formatDate(last, { month: "short", day: "numeric", year: "numeric" }, locale);
    return `${firstLabel} – ${lastLabel}`;
  }
  if (start.month !== last.month) {
    const firstLabel = formatDate(start, { month: "short", day: "numeric" }, locale);
    const lastLabel = formatDate(last, { month: "short", day: "numeric" }, locale);
    return `${firstLabel} – ${lastLabel}`;
  }
  const month = formatDate(start, { month: "short" }, locale);
  return start.day === last.day ? `${month} ${start.day}` : `${month} ${start.day}–${last.day}`;
}
