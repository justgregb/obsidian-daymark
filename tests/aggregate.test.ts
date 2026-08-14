import { describe, expect, it } from "vitest";
import { aggregateRecords } from "../src/aggregate";
import { getPeriodBounds } from "../src/date";
import { DaymarkStore } from "../src/store";
import type { DailyRecord } from "../src/types";

function record(isoDate: string, words: number, completed: number, value?: number): DailyRecord {
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  return {
    path: `Journal/${year}/${String(month).padStart(2, "0")}/${isoDate}.md`,
    basename: isoDate,
    date: { year, month, day },
    isoDate,
    words,
    totalCheckboxes: completed,
    completedCheckboxes: completed,
    taggedTasks: value === undefined ? [] : [{ tag: "pushups", value, text: `${value} #pushups`, line: 5 }]
  };
}

describe("period aggregation", () => {
  it("totals only records inside the selected period and preserves sources", () => {
    const records = [
      record("2026-08-09", 30, 1, 20),
      record("2026-08-10", 100, 2, 50),
      record("2026-08-12", 80, 1, 160),
      record("2026-08-17", 200, 3, 100)
    ];
    const bounds = getPeriodBounds({ year: 2026, month: 8, day: 12 }, "week", 1);
    const result = aggregateRecords(records, bounds);
    expect(result.noteCount).toBe(2);
    expect(result.notePaths).toEqual([
      "Journal/2026/08/2026-08-10.md",
      "Journal/2026/08/2026-08-12.md"
    ]);
    expect(result.noteSources.map(({ isoDate, value }) => ({ isoDate, value }))).toEqual([
      { isoDate: "2026-08-10", value: 1 },
      { isoDate: "2026-08-12", value: 1 }
    ]);
    expect(result.words).toBe(180);
    expect(result.completedCheckboxes).toBe(3);
    expect(result.tags[0]?.total).toBe(210);
    expect(result.tags[0]?.sources.map((source) => source.isoDate)).toEqual(["2026-08-10", "2026-08-12"]);
  });

  it("handles month and year boundaries", () => {
    const records = [
      record("2025-12-31", 10, 1, 10),
      record("2026-01-01", 20, 1, 20),
      record("2026-01-31", 30, 1, 30),
      record("2026-02-01", 40, 1, 40)
    ];
    const january = aggregateRecords(records, getPeriodBounds({ year: 2026, month: 1, day: 15 }, "month", 1));
    const year = aggregateRecords(records, getPeriodBounds({ year: 2026, month: 8, day: 12 }, "year", 1));
    expect(january.words).toBe(50);
    expect(january.tags[0]?.sources.map((source) => source.isoDate)).toEqual(["2026-01-01", "2026-01-31"]);
    expect(year.words).toBe(90);
    expect(year.completedCheckboxes).toBe(3);
  });
});

describe("incremental store behavior", () => {
  it("supports create, modify, rename, delete, and full replacement", () => {
    const store = new DaymarkStore();
    const first = record("2026-08-10", 10, 1, 10);
    store.upsert(first);
    expect(store.size).toBe(1);
    expect(store.getByIsoDate(first.isoDate)).toBe(first);

    const modified = { ...first, words: 20 };
    store.upsert(modified);
    expect(store.getByIsoDate(first.isoDate)).toBe(modified);
    const week = getPeriodBounds(first.date, "week", 1);
    expect(store.aggregate(week).words).toBe(20);

    const moved = { ...first, path: "Journal/Archive/2026-08-10.md", words: 30 };
    store.remove(first.path);
    store.upsert(moved);
    expect(store.aggregate(week).words).toBe(30);

    store.remove(moved.path);
    expect(store.size).toBe(0);
    expect(store.getByIsoDate(first.isoDate)).toBeNull();

    const second = record("2026-08-11", 15, 0);
    store.replace([first, second]);
    expect(store.size).toBe(2);
    expect(store.getByIsoDate(second.isoDate)).toBe(second);
    expect(store.aggregate(week).words).toBe(25);
  });

  it("keeps date lookup correct when an indexed path moves to another date", () => {
    const store = new DaymarkStore();
    const first = record("2026-08-10", 10, 0);
    const changedDate = {
      ...record("2026-08-11", 20, 0),
      path: first.path
    };

    store.upsert(first);
    store.upsert(changedDate);

    expect(store.getByIsoDate(first.isoDate)).toBeNull();
    expect(store.getByIsoDate(changedDate.isoDate)).toBe(changedDate);
  });

  it("reuses period aggregates until the journal index changes", () => {
    const store = new DaymarkStore();
    const first = record("2026-08-10", 10, 0);
    const bounds = getPeriodBounds(first.date, "week", 1);
    store.upsert(first);

    const cached = store.aggregate(bounds);
    expect(store.aggregate(bounds)).toBe(cached);

    store.upsert({ ...first, words: 25 });
    const refreshed = store.aggregate(bounds);
    expect(refreshed).not.toBe(cached);
    expect(refreshed.words).toBe(25);
    expect(store.aggregate(bounds)).toBe(refreshed);
  });
});
