import { describe, expect, it } from "vitest";
import { aggregateRecords } from "../src/aggregate";
import { getPeriodBounds, parseIsoDate } from "../src/date";
import { marginTallyLenses, normalizeMarginLens, resolveMarginLens } from "../src/margin-tally";
import { DaymarkStore } from "../src/store";
import { DEFAULT_SETTINGS, type DailyRecord } from "../src/types";

const settings = { ...DEFAULT_SETTINGS, tallyMetricLabels: { photos: "Images" }, tallyTagLabels: { swimming: "Swim sessions", "random/тег": "Zebra" } };
const bounds = getPeriodBounds({ year: 2026, month: 9, day: 1 }, "month", 1);
function note(isoDate: string, overrides: Partial<DailyRecord> = {}): DailyRecord {
  return { isoDate, date: parseIsoDate(isoDate)!, path: `${isoDate}.md`, basename: isoDate,
    words: 10, photos: 0, completedCheckboxes: 0, totalCheckboxes: 0, taggedValues: [], ...overrides };
}
const records = [
  note("2026-09-01", { taggedValues: [{ tag: "swimming", value: 0 }], linkedWords: 1000 }),
  note("2026-09-02", { taggedValues: [{ tag: "swimming", value: 1.25 }, { tag: "random/тег", value: 4 }], photos: 2 }),
  note("2026-09-02", { path: "other.md", taggedValues: [{ tag: "swimming", value: 2.5 }], words: 20 }),
  note("2026-09-03"), note("2026-10-01", { taggedValues: [{ tag: "swimming", value: 100 }] })
];
const lenses = () => marginTallyLenses(aggregateRecords(records, bounds), settings, "en");

describe("Margin monthly Tally lenses", () => {
  it("builds only the requested lens and preserves its totals, zeroes and scale", () => {
    const aggregate = aggregateRecords(records, bounds);
    for (const expected of lenses()) {
      expect(marginTallyLenses(aggregate, settings, "en", expected.id)).toEqual([expected]);
    }
    expect(marginTallyLenses(aggregate, settings, "en", "tag:missing")).toEqual([]);
  });
  it("does not traverse unused metric sources for a selected tag", () => {
    const aggregate = aggregateRecords(records, bounds);
    const unused = { [Symbol.iterator]() { throw new Error("Unselected source was traversed"); } };
    aggregate.noteSources = unused as never;
    aggregate.wordSources = unused as never;
    aggregate.photoSources = unused as never;
    aggregate.checkboxSources = unused as never;
    expect(marginTallyLenses(aggregate, settings, "en", "tag:swimming")[0].total).toBe(3.75);
  });
  it("uses custom metric/tag names and sorts tags by their display names", () => {
    expect(lenses().map(lens => lens.label)).toEqual(["Daily notes", "Words", "Images", "Swim sessions", "Zebra"]);
  });
  it("sums multiple notes and values on one date while excluding other months", () => {
    const swimming = lenses().find(lens => lens.id === "tag:swimming")!;
    expect(swimming.total).toBe(3.75);
    expect(swimming.values.get("2026-09-02")).toBe(3.75);
    expect(swimming.maximum).toBe(3.75);
    expect([...swimming.values.values()].reduce((sum, value) => sum + value, 0)).toBe(swimming.total);
  });
  it("distinguishes a recorded zero from a day with no matching hashtag", () => {
    const swimming = lenses().find(lens => lens.id === "tag:swimming")!;
    expect(swimming.values.get("2026-09-01")).toBe(0);
    expect(swimming.values.get("2026-09-03")).toBeUndefined();
    expect(swimming.values.get("2026-09-04")).toBeUndefined();
  });
  it("keeps writing links out of Tally and fills base-metric zeroes only on note dates", () => {
    const words = lenses().find(lens => lens.id === "words")!;
    expect(words.total).toBe(50);
    const photos = lenses().find(lens => lens.id === "photos")!;
    expect(photos.values.get("2026-09-01")).toBe(0);
    expect(photos.values.get("2026-09-04")).toBeUndefined();
    expect(lenses().find(lens => lens.id === "dailyNotes")!.values.get("2026-09-02")).toBe(2);
  });
  it("uses completed untagged items and hides the metric when no checkboxes exist", () => {
    expect(lenses().some(lens => lens.id === "checkedItems")).toBe(false);
    const result = marginTallyLenses(aggregateRecords([note("2026-09-01", { totalCheckboxes: 3, completedCheckboxes: 2 })], bounds), settings, "en");
    expect(result.find(lens => lens.id === "checkedItems")).toMatchObject({ total: 2, maximum: 2 });
  });
  it("keeps the chosen lens and custom label in an empty month", () => {
    const empty = marginTallyLenses(aggregateRecords([], bounds), settings, "en");
    expect(empty).toEqual([]);
    expect(resolveMarginLens("tag:swimming", empty, settings, "en")).toMatchObject({ label: "Swim sessions", total: 0, maximum: 0 });
    expect(resolveMarginLens(null, empty, settings, "en")).toBeNull();
  });
  it("recalculates the scale and totals after edits and deletions", () => {
    const store = new DaymarkStore();
    const day = note("2026-09-01", { taggedValues: [{ tag: "swimming", value: 2 }] });
    store.upsert(day);
    const current = () => marginTallyLenses(store.aggregate(bounds), settings, "en").find(lens => lens.id === "tag:swimming");
    expect(current()?.maximum).toBe(2);
    store.upsert({ ...day, taggedValues: [{ tag: "swimming", value: 9 }] });
    expect(current()).toMatchObject({ total: 9, maximum: 9 });
    store.remove(day.path);
    expect(current()).toBeUndefined();
  });
  it("normalizes saved lens IDs without treating arbitrary saved text as a metric", () => {
    expect(normalizeMarginLens("tag:#SWIMMING")).toBe("tag:swimming");
    expect(normalizeMarginLens("photos")).toBe("photos");
    for (const value of [null, 3, {}, "bogus", "tag:", "tag:<button>"]) expect(normalizeMarginLens(value)).toBeNull();
  });
});
