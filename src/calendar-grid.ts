import { addDays, getPeriodBounds, shiftAnchor } from "./date";
import type { PlainDate, Weekday } from "./types";

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

export function calendarMonthCells(month: PlainDate, weekStart: Weekday): Array<PlainDate | null> {
  const start = { year: month.year, month: month.month, day: 1 };
  const startWeekday = new Date(Date.UTC(start.year, start.month - 1, start.day)).getUTCDay();
  const leadingBlanks = (startWeekday - weekStart + 7) % 7;
  const nextMonth = getPeriodBounds(start, "month", weekStart).end;
  const dayCount = Math.round((Date.UTC(nextMonth.year, nextMonth.month - 1, nextMonth.day)
    - Date.UTC(start.year, start.month - 1, start.day)) / 86_400_000);
  const cells: Array<PlainDate | null> = Array.from({ length: 42 }, () => null);
  for (let day = 1; day <= dayCount; day += 1) {
    cells[leadingBlanks + day - 1] = { year: start.year, month: start.month, day };
  }
  return cells;
}

export function calendarMonthSequence(anchor: PlainDate, radius = 1): PlainDate[] {
  const month = { year: anchor.year, month: anchor.month, day: 1 };
  return Array.from({ length: radius * 2 + 1 }, (_, index) => (
    shiftAnchor(month, "month", index - radius)
  ));
}

export function calendarMonthDistance(from: PlainDate, to: PlainDate): number {
  return (to.year - from.year) * 12 + to.month - from.month;
}

export function calendarWeekdays(weekStart: Weekday): Weekday[] {
  return Array.from({ length: 7 }, (_, index) => ((weekStart + index) % 7) as Weekday);
}

export function calendarWeekDates(anchor: PlainDate, weekStart: Weekday): PlainDate[] {
  const start = getPeriodBounds(anchor, "week", weekStart).start;
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function calendarWeekSequence(anchor: PlainDate, weekStart: Weekday, radius = 1): PlainDate[] {
  const start = getPeriodBounds(anchor, "week", weekStart).start;
  return Array.from({ length: radius * 2 + 1 }, (_, index) => (
    shiftAnchor(start, "week", index - radius)
  ));
}

export function calendarWeekDistance(from: PlainDate, to: PlainDate, weekStart: Weekday): number {
  const fromStart = getPeriodBounds(from, "week", weekStart).start;
  const toStart = getPeriodBounds(to, "week", weekStart).start;
  const fromTime = Date.UTC(fromStart.year, fromStart.month - 1, fromStart.day);
  const toTime = Date.UTC(toStart.year, toStart.month - 1, toStart.day);
  return Math.round((toTime - fromTime) / 604_800_000);
}

export function calendarYearSequence(anchor: PlainDate, radius = 1): PlainDate[] {
  return Array.from({ length: radius * 2 + 1 }, (_, index) => ({
    year: anchor.year + index - radius,
    month: 1,
    day: 1
  }));
}

export function calendarYearDistance(from: PlainDate, to: PlainDate): number {
  return to.year - from.year;
}
