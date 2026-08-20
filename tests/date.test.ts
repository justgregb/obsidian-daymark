import { describe, expect, it } from "vitest";
import {
  addDays,
  compareDates,
  dateIsWithin,
  datesEqual,
  formatPeriodTitle,
  getPeriodBounds,
  isSupportedDateFormat,
  parseDateFromBasename,
  shiftAnchor,
  toIsoDate
} from "../src/date";

describe("daily-note dates", () => {
  it("strictly parses supported filename formats", () => {
    expect(parseDateFromBasename("2026-08-12", "YYYY-MM-DD")).toEqual({ year: 2026, month: 8, day: 12 });
    expect(parseDateFromBasename("12.08.2026", "DD.MM.YYYY")).toEqual({ year: 2026, month: 8, day: 12 });
    expect(parseDateFromBasename("20260812", "YYYYMMDD")).toEqual({ year: 2026, month: 8, day: 12 });
    expect(parseDateFromBasename("note-2026-08-12", "YYYY-MM-DD")).toBeNull();
    expect(parseDateFromBasename("2026-02-29", "YYYY-MM-DD")).toBeNull();
    expect(parseDateFromBasename("2024-02-29", "YYYY-MM-DD")).not.toBeNull();
  });

  it("requires every supported token exactly once", () => {
    expect(isSupportedDateFormat("YYYY-MM-DD")).toBe(true);
    expect(isSupportedDateFormat("YYYY-MM")).toBe(false);
    expect(isSupportedDateFormat("YYYY-MM-DD-YYYY")).toBe(false);
  });
});

describe("period boundaries", () => {
  const anchor = { year: 2026, month: 8, day: 12 };

  it("uses Monday or Sunday week starts", () => {
    expect(toIsoDate(getPeriodBounds(anchor, "week", 1).start)).toBe("2026-08-10");
    expect(toIsoDate(getPeriodBounds(anchor, "week", 0).start)).toBe("2026-08-09");
  });

  it("handles month and year transitions", () => {
    expect(toIsoDate(getPeriodBounds(anchor, "month", 1).end)).toBe("2026-09-01");
    expect(toIsoDate(getPeriodBounds(anchor, "year", 1).end)).toBe("2027-01-01");
    expect(toIsoDate(addDays({ year: 2024, month: 2, day: 28 }, 1))).toBe("2024-02-29");
  });

  it("compares and bounds dates without changing chronological behavior", () => {
    const bounds = getPeriodBounds(anchor, "month", 1);
    expect(compareDates({ year: 2025, month: 12, day: 31 }, { year: 2026, month: 1, day: 1 })).toBeLessThan(0);
    expect(compareDates(anchor, anchor)).toBe(0);
    expect(compareDates({ year: 2026, month: 10, day: 1 }, { year: 2026, month: 9, day: 30 })).toBeGreaterThan(0);
    expect(dateIsWithin({ year: 2026, month: 8, day: 1 }, bounds)).toBe(true);
    expect(dateIsWithin({ year: 2026, month: 9, day: 1 }, bounds)).toBe(false);
  });

  it("compares date identity without formatting", () => {
    expect(datesEqual(anchor, { year: 2026, month: 8, day: 12 })).toBe(true);
    expect(datesEqual(anchor, { year: 2026, month: 8, day: 13 })).toBe(false);
  });

  it("clamps shifted anchors to valid dates", () => {
    expect(shiftAnchor({ year: 2026, month: 1, day: 31 }, "month", 1)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(shiftAnchor({ year: 2024, month: 2, day: 29 }, "year", 1)).toEqual({ year: 2025, month: 2, day: 28 });
  });

  it("formats readable titles", () => {
    const bounds = getPeriodBounds(anchor, "week", 1);
    expect(formatPeriodTitle(bounds, "week", "en-US")).toBe("Aug 10–16 ’26");
    expect(formatPeriodTitle(
      getPeriodBounds({ year: 2026, month: 7, day: 29 }, "week", 1),
      "week",
      "en-US"
    )).toBe("Jul 27–Aug 2 ’26");
    expect(formatPeriodTitle(
      getPeriodBounds({ year: 2026, month: 12, day: 30 }, "week", 1),
      "week",
      "en-US"
    )).toBe("Dec 28–Jan 3 ’27");
    expect(formatPeriodTitle(getPeriodBounds(anchor, "month", 1), "month", "en-US")).toBe("Aug 2026");
  });
});
