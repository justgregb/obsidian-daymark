import { describe, expect, it } from "vitest";
import { changeAffectsBounds, DaymarkChangeAccumulator } from "../src/change-set";

describe("scoped Daymark changes", () => {
  it("merges a sync burst without duplicate dates or paths", () => {
    const changes = new DaymarkChangeAccumulator();
    changes.add({ dailyDates: ["2026-08-12"], dailyPaths: ["Journal/2026-08-12.md"] });
    changes.add({
      dailyDates: ["2026-08-12", "2026-08-13"],
      coverDates: ["2026-08-14"],
      dailyPaths: ["Journal/2026-08-12.md"],
      additionalWords: true,
      reportPaths: ["Journal/Tally — 2026-08.md"]
    });

    expect(changes.take()).toEqual({
      full: false,
      dailyDates: ["2026-08-12", "2026-08-13"],
      coverDates: ["2026-08-14"],
      dailyPaths: ["Journal/2026-08-12.md"],
      additionalWords: true,
      reportPaths: ["Journal/Tally — 2026-08.md"]
    });
    expect(changes.take()).toBeNull();
  });

  it("checks daily changes against half-open period bounds", () => {
    const changes = new DaymarkChangeAccumulator();
    changes.add({ dailyDates: ["2026-08-31", "2026-09-01"] });
    const change = changes.take();
    expect(change).not.toBeNull();
    if (!change) return;

    expect(changeAffectsBounds(change, {
      start: { year: 2026, month: 8, day: 1 },
      end: { year: 2026, month: 9, day: 1 }
    })).toBe(true);
    expect(changeAffectsBounds(change, {
      start: { year: 2026, month: 7, day: 1 },
      end: { year: 2026, month: 8, day: 1 }
    })).toBe(false);
  });

  it("keeps cover-only metadata changes out of period totals", () => {
    const changes = new DaymarkChangeAccumulator();
    changes.add({ coverDates: ["2026-08-12"], dailyPaths: ["Journal/2026-08-12.md"] });
    const change = changes.take();
    expect(change).not.toBeNull();
    if (!change) return;

    expect(changeAffectsBounds(change, {
      start: { year: 2026, month: 8, day: 1 },
      end: { year: 2026, month: 9, day: 1 }
    })).toBe(false);
  });
});
