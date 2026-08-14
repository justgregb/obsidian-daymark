import { describe, expect, it } from "vitest";
import { legacyTallyToDaymarkState } from "../src/legacy-tally-state";

describe("legacy Tally view migration", () => {
  const fallback = { year: 2026, month: 8, day: 14 };

  it("preserves the period and opens the unified Tally disclosure", () => {
    expect(legacyTallyToDaymarkState({ mode: "year", anchorDate: "2025-02-03" }, fallback)).toEqual({
      mode: "year",
      month: "2025-02-03",
      week: "2025-02-03",
      selectedDate: "2025-02-03",
      tallyExpanded: true
    });
  });

  it("uses a safe current-date fallback for malformed legacy state", () => {
    expect(legacyTallyToDaymarkState({ mode: "other", anchorDate: "not-a-date" }, fallback)).toEqual({
      mode: "week",
      month: "2026-08-14",
      week: "2026-08-14",
      selectedDate: "2026-08-14",
      tallyExpanded: true
    });
  });
});
