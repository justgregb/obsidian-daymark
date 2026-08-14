import { describe, expect, it } from "vitest";
import {
  calendarGridDates,
  calendarMonthCells,
  calendarMonthDistance,
  calendarMonthSequence,
  calendarWeekDates,
  calendarWeekDistance,
  calendarWeekSequence,
  calendarWeekdays,
  calendarYearDistance,
  calendarYearSequence
} from "../src/calendar-grid";
import { toIsoDate } from "../src/date";

describe("sidebar calendar grid", () => {
  it("builds complete Monday-first calendar weeks around a month", () => {
    const dates = calendarGridDates({ year: 2026, month: 8, day: 12 }, 1);
    expect(dates).toHaveLength(42);
    expect(toIsoDate(dates[0]!)).toBe("2026-07-27");
    expect(toIsoDate(dates.at(-1)!)).toBe("2026-09-06");
  });

  it("supports Sunday-first calendars", () => {
    const dates = calendarGridDates({ year: 2026, month: 8, day: 1 }, 0);
    expect(dates).toHaveLength(42);
    expect(toIsoDate(dates[0]!)).toBe("2026-07-26");
    expect(calendarWeekdays(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(calendarWeekdays(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("builds a seven-day agenda using the configured first weekday", () => {
    expect(calendarWeekDates({ year: 2026, month: 8, day: 12 }, 1).map(toIsoDate)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16"
    ]);
    expect(toIsoDate(calendarWeekDates({ year: 2026, month: 8, day: 12 }, 0)[0]!)).toBe("2026-08-09");
  });

  it("builds rolling Week-view sequences across year boundaries", () => {
    const weeks = calendarWeekSequence({ year: 2026, month: 1, day: 1 }, 1, 3);
    expect(weeks.map(toIsoDate)).toEqual([
      "2025-12-08",
      "2025-12-15",
      "2025-12-22",
      "2025-12-29",
      "2026-01-05",
      "2026-01-12",
      "2026-01-19"
    ]);
    expect(calendarWeekDistance(
      { year: 2025, month: 12, day: 29 },
      { year: 2026, month: 1, day: 12 },
      1
    )).toBe(2);
  });

  it("builds rolling Year-view sequences", () => {
    expect(calendarYearSequence({ year: 2026, month: 8, day: 14 }).map(toIsoDate)).toEqual([
      "2025-01-01",
      "2026-01-01",
      "2027-01-01"
    ]);
    expect(calendarYearDistance(
      { year: 2026, month: 8, day: 14 },
      { year: 2024, month: 1, day: 1 }
    )).toBe(-2);
  });

  it("builds fixed mini-month cells without repeating adjacent dates", () => {
    const cells = calendarMonthCells({ year: 2026, month: 8, day: 12 }, 1);
    expect(cells).toHaveLength(42);
    expect(cells.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(toIsoDate(cells[5]!)).toBe("2026-08-01");
    expect(toIsoDate(cells[35]!)).toBe("2026-08-31");
    expect(cells.slice(36)).toEqual([null, null, null, null, null, null]);
  });

  it("includes leap day in a Year-view mini-month", () => {
    const cells = calendarMonthCells({ year: 2028, month: 2, day: 1 }, 0);
    expect(cells.filter((date) => date !== null)).toHaveLength(29);
    expect(cells.some((date) => date !== null && toIsoDate(date) === "2028-02-29")).toBe(true);
  });

  it("builds a rolling Month-view sequence across year boundaries", () => {
    expect(calendarMonthSequence({ year: 2026, month: 1, day: 14 }).map(toIsoDate)).toEqual([
      "2025-12-01",
      "2026-01-01",
      "2026-02-01"
    ]);
    expect(calendarMonthDistance(
      { year: 2026, month: 1, day: 1 },
      { year: 2025, month: 12, day: 1 }
    )).toBe(-1);
    expect(calendarMonthDistance(
      { year: 2026, month: 12, day: 1 },
      { year: 2027, month: 2, day: 1 }
    )).toBe(2);

    const nearby = calendarMonthSequence({ year: 2026, month: 1, day: 14 }, 3);
    expect(nearby).toHaveLength(7);
    expect(toIsoDate(nearby[0]!)).toBe("2025-10-01");
    expect(toIsoDate(nearby.at(-1)!)).toBe("2026-04-01");
  });
});
