import { addDays, getPeriodBounds } from "./date";
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

export function calendarWeekdays(weekStart: Weekday): Weekday[] {
  return Array.from({ length: 7 }, (_, index) => ((weekStart + index) % 7) as Weekday);
}

export function calendarWeekDates(anchor: PlainDate, weekStart: Weekday): PlainDate[] {
  const start = getPeriodBounds(anchor, "week", weekStart).start;
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}
