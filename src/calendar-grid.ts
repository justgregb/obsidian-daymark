import { addDays, getPeriodBounds, toDate } from "./date";
import type { PlainDate, Weekday } from "./types";

export type WritingIntensity = "low" | "medium" | "high";

export function yearWritingIntensity(words: number, busiestDayWords: number): WritingIntensity | null {
  if (words <= 0 || busiestDayWords <= 0) return null;
  const ratio = words / busiestDayWords;
  if (ratio <= 1 / 3) return "low";
  if (ratio <= 2 / 3) return "medium";
  return "high";
}

export function calendarGridDates(month: PlainDate, weekStart: Weekday): PlainDate[] {
  const monthBounds = getPeriodBounds({ year: month.year, month: month.month, day: 1 }, "month", weekStart);
  const start = getPeriodBounds(monthBounds.start, "week", weekStart).start;
  const lastDay = addDays(monthBounds.end, -1);
  const end = getPeriodBounds(lastDay, "week", weekStart).end;
  const dates: PlainDate[] = [];
  for (let date = start; date.year !== end.year || date.month !== end.month || date.day !== end.day; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

export function calendarWeekdays(weekStart: Weekday): Weekday[] {
  return Array.from({ length: 7 }, (_, index) => ((weekStart + index) % 7) as Weekday);
}

export function calendarWeekDates(anchor: PlainDate, weekStart: Weekday): PlainDate[] {
  const start = getPeriodBounds(anchor, "week", weekStart).start;
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function calendarYearActivityDates(month: PlainDate, weekStart: Weekday): Array<PlainDate | null> {
  const first = { year: month.year, month: month.month, day: 1 };
  const offset = (toDate(first).getUTCDay() - weekStart + 7) % 7;
  const end = getPeriodBounds(first, "month", weekStart).end;
  const dayCount = Math.round((toDate(end).getTime() - toDate(first).getTime()) / 86_400_000);
  const dates = Array<PlainDate | null>(42).fill(null);

  for (let day = 1; day <= dayCount; day += 1) {
    dates[offset + day - 1] = { year: first.year, month: first.month, day };
  }

  return dates;
}
