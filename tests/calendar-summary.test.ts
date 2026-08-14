import { describe, expect, it } from "vitest";
import { formatCalendarFooterSummary, periodDayCount } from "../src/calendar-summary";
import type { PeriodAggregate } from "../src/types";

function aggregate(overrides: Partial<PeriodAggregate> = {}): PeriodAggregate {
  return {
    bounds: { start: { year: 2026, month: 8, day: 1 }, end: { year: 2026, month: 9, day: 1 } },
    noteCount: 12,
    notePaths: [],
    noteSources: [],
    words: 142,
    totalCheckboxes: 6,
    completedCheckboxes: 5,
    wordSources: [],
    checkboxSources: [],
    tags: [],
    ...overrides
  };
}

describe("calendar period summary", () => {
  it("counts days across weeks, months, and leap years", () => {
    expect(periodDayCount({ start: { year: 2026, month: 8, day: 10 }, end: { year: 2026, month: 8, day: 17 } })).toBe(7);
    expect(periodDayCount(aggregate().bounds)).toBe(31);
    expect(periodDayCount({ start: { year: 2024, month: 1, day: 1 }, end: { year: 2025, month: 1, day: 1 } })).toBe(366);
  });

  it("shows coverage instead of an ambiguous raw note count", () => {
    expect(formatCalendarFooterSummary(aggregate(), "en")).toEqual({
      full: "12/31 days · 142 words · 5/6 checked",
      compact: "12/31 · 142 words · 5/6"
    });
  });

  it("keeps an empty period quiet", () => {
    expect(formatCalendarFooterSummary(
      aggregate({ noteCount: 0, words: 0, totalCheckboxes: 0, completedCheckboxes: 0 }),
      "en"
    )).toEqual({ full: "No daily notes", compact: "No daily notes" });
  });

  it("keeps a checkbox-free summary on one line", () => {
    expect(formatCalendarFooterSummary(aggregate({ totalCheckboxes: 0, completedCheckboxes: 0 }), "en"))
      .toEqual({ full: "12/31 days · 142 words", compact: "12/31 · 142 words" });
  });
});
