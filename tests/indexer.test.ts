import { describe, expect, it } from "vitest";
import { getPeriodBounds } from "../src/date";
import { DaymarkIndex } from "../src/indexer";
import type { DaymarkSettings } from "../src/types";

interface FakeFile {
  readonly path: string;
  readonly basename: string;
}

describe("daily-note index", () => {
  it("discovers each matching date once during a full rebuild", async () => {
    const pathReads = new Map<string, number>();
    const makeFile = (path: string): FakeFile => ({
      get path() {
        pathReads.set(path, (pathReads.get(path) ?? 0) + 1);
        return path;
      },
      basename: path.slice(path.lastIndexOf("/") + 1, -3)
    });
    const firstPath = "Journal/2026/08/2026-08-10.md";
    const secondPath = "Journal/2026/08/2026-08-12.md";
    const unrelatedPath = "Desk/notes.md";
    const first = makeFile(firstPath);
    const second = makeFile(secondPath);
    const unrelated = makeFile(unrelatedPath);
    const contents = new Map<FakeFile, string>([
      [first, "One two"],
      [second, "Three four five"]
    ]);
    const app = {
      vault: {
        getMarkdownFiles: () => [first, second, unrelated],
        cachedRead: async (file: FakeFile) => contents.get(file) ?? ""
      }
    } as unknown as ConstructorParameters<typeof DaymarkIndex>[0];
    const settings: DaymarkSettings = {
      settingsVersion: 1,
      journalFolder: "Journal",
      dateFormat: "YYYY/MM/YYYY-MM-DD",
      templatePath: "",
      additionalWordFolder: "",
      weekStart: "monday",
      highlightedWeekdays: [],
      showCoverPhotos: true,
      showCalendarTotals: true,
      tallyEnabled: true
    };
    const index = new DaymarkIndex(app, () => settings, () => "en-US");

    await index.rebuild();

    const aggregate = index.aggregate(getPeriodBounds({ year: 2026, month: 8, day: 1 }, "month", 1));
    expect(aggregate.noteCount).toBe(2);
    expect(aggregate.words).toBe(5);
    expect(pathReads).toEqual(new Map([
      [firstPath, 2],
      [secondPath, 2],
      [unrelatedPath, 1]
    ]));
  });
});
