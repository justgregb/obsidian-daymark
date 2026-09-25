import { describe, expect, it } from "vitest";
import { marginFolds } from "../src/margin-folds";
import { normalizeMarginScroll } from "../src/margin-timeline";
import { addDays, parseIsoDate, toIsoDate } from "../src/date";
import { vi } from "vitest";
vi.mock("../src/margin-calendar-view", () => ({}));
const range = (start: string, count: number) => Array.from({ length: count }, (_, i) => toIsoDate(addDays(parseIsoDate(start)!, i)));

describe("missing-day runs", () => {
  it("requires three consecutive eligible dates", () => {
    expect(marginFolds(range("2026-09-01", 2), () => true)).toEqual([]);
    expect(marginFolds(range("2026-09-01", 3), () => true)).toEqual([
      { start: "2026-09-01", end: "2026-09-03", dates: range("2026-09-01", 3) }
    ]);
  });
  it("splits at content, month boundaries and noncontiguous dates", () => {
    expect(marginFolds([...range("2026-09-25", 10), ...range("2026-10-10", 3)], iso => iso !== "2026-09-28")
      .map(({ start, end }) => [start, end])).toEqual([
      ["2026-09-25", "2026-09-27"], ["2026-10-01", "2026-10-04"], ["2026-10-10", "2026-10-12"]
    ]);
  });
  it("handles leap days and year boundaries", () => {
    expect(marginFolds(range("2028-02-27", 6), () => true).map(fold => fold.dates.length)).toEqual([3, 3]);
    expect(marginFolds(range("2026-12-29", 6), () => true).map(fold => fold.dates.length)).toEqual([3, 3]);
  });
  it("normalizes folded scroll anchors without confusing month labels", () => {
    expect(normalizeMarginScroll({ date: "2026-09-01", fraction: .5, fold: true }))
      .toEqual({ date: "2026-09-01", fraction: .5, fold: true });
    expect(normalizeMarginScroll({ date: "2026-09-01", fraction: 0, fold: true, monthLabel: true })).toBeNull();
    expect(normalizeMarginScroll({ date: "2026-09-01", fraction: 0, fold: false })).toBeNull();
  });
});
