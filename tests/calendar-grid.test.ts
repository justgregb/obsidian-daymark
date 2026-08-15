import { describe, expect, it } from "vitest";
import {
  calendarGridDates,
  calendarWeekDates,
  calendarWeekdays,
  calendarYearActivityDates,
  yearWritingIntensity
} from "../src/calendar-grid";
import { toIsoDate } from "../src/date";
import type { PlainDate } from "../src/types";

function checkedIsoDate(date: PlainDate | null | undefined): string {
  if (!date) throw new Error("Expected a calendar date.");
  return toIsoDate(date);
}

describe("sidebar calendar grid", () => {
  it("builds complete Monday-first calendar weeks around a month", () => {
    const dates = calendarGridDates({ year: 2026, month: 8, day: 12 }, 1);
    expect(dates).toHaveLength(42);
    expect(checkedIsoDate(dates[0])).toBe("2026-07-27");
    expect(checkedIsoDate(dates.at(-1))).toBe("2026-09-06");
  });

  it("supports Sunday-first calendars", () => {
    const dates = calendarGridDates({ year: 2026, month: 8, day: 1 }, 0);
    expect(dates).toHaveLength(42);
    expect(checkedIsoDate(dates[0])).toBe("2026-07-26");
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
    expect(checkedIsoDate(calendarWeekDates({ year: 2026, month: 8, day: 12 }, 0)[0])).toBe("2026-08-09");
  });

  it("builds fixed six-row activity grids for the year view", () => {
    const mondayFirst = calendarYearActivityDates({ year: 2026, month: 8, day: 12 }, 1);
    expect(mondayFirst).toHaveLength(42);
    expect(mondayFirst.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(checkedIsoDate(mondayFirst[5])).toBe("2026-08-01");
    expect(checkedIsoDate(mondayFirst[35])).toBe("2026-08-31");
    expect(mondayFirst.slice(36)).toEqual([null, null, null, null, null, null]);

    const sundayFirst = calendarYearActivityDates({ year: 2026, month: 8, day: 1 }, 0);
    expect(checkedIsoDate(sundayFirst[6])).toBe("2026-08-01");
  });

  it("maps writing volume to three levels relative to the busiest day", () => {
    expect(yearWritingIntensity(0, 600)).toBeNull();
    expect(yearWritingIntensity(100, 600)).toBe("low");
    expect(yearWritingIntensity(300, 600)).toBe("medium");
    expect(yearWritingIntensity(600, 600)).toBe("high");
    expect(yearWritingIntensity(10, 0)).toBeNull();
  });

});
