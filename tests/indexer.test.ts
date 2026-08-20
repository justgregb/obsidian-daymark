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
      [first, "One two\n![[cover.jpg]]"],
      [second, "Three four five\n![Detail](Assets/detail.png)"]
    ]);
    const app = {
      vault: {
        getMarkdownFiles: () => [first, second, unrelated],
        cachedRead: async (file: FakeFile) => contents.get(file) ?? ""
      }
    } as unknown as ConstructorParameters<typeof DaymarkIndex>[0];
    const settings: DaymarkSettings = {
      settingsVersion: 3,
      journalFolder: "Journal",
      dateFormat: "YYYY/MM/YYYY-MM-DD",
      templatePath: "",
      additionalWordFolder: "",
      weekStart: "monday",
      highlightedWeekdays: [],
      showCoverPhotos: true,
      showCalendarTotals: true,
      tallyEnabled: true,
      tallyMetricLabels: {},
      tallyTagLabels: {}
    };
    const index = new DaymarkIndex(app, () => settings, () => "en-US");

    await index.rebuild();

    const aggregate = index.aggregate(getPeriodBounds({ year: 2026, month: 8, day: 1 }, "month", 1));
    expect(aggregate.noteCount).toBe(2);
    expect(aggregate.words).toBe(5);
    expect(aggregate.photos).toBe(2);
    expect(pathReads).toEqual(new Map([
      [firstPath, 2],
      [secondPath, 2],
      [unrelatedPath, 1]
    ]));
    expect(index.isReady).toBe(true);
  });

  it("tracks known completed-item tags through incremental changes", async () => {
    const makeFile = (path: string): FakeFile => ({
      path,
      basename: path.slice(path.lastIndexOf("/") + 1, -3)
    });
    const first = makeFile("Journal/2026-08-10.md");
    const second = makeFile("Journal/2026-08-11.md");
    const moved = makeFile("Journal/2026-08-12.md");
    const contents = new Map<FakeFile, string>([
      [first, "- [x] 100 #pushups\n- [ ] 5 #unchecked"],
      [second, "- [X] 6 #running"]
    ]);
    const app = {
      vault: {
        getMarkdownFiles: () => [first, second],
        cachedRead: async (file: FakeFile) => contents.get(file) ?? ""
      }
    } as unknown as ConstructorParameters<typeof DaymarkIndex>[0];
    const settings: DaymarkSettings = {
      settingsVersion: 3,
      journalFolder: "Journal",
      dateFormat: "YYYY-MM-DD",
      templatePath: "",
      additionalWordFolder: "",
      weekStart: "monday",
      highlightedWeekdays: [],
      showCoverPhotos: true,
      showCalendarTotals: true,
      tallyEnabled: true,
      tallyMetricLabels: {},
      tallyTagLabels: {}
    };
    const index = new DaymarkIndex(app, () => settings, () => "en-US");

    expect(index.isReady).toBe(false);
    await index.ensureReady();
    expect(index.knownTags()).toEqual(["pushups", "running"]);

    contents.set(first, "- [x] 12 #cycling");
    await index.refresh(first as never);
    expect(index.knownTags()).toEqual(["cycling", "running"]);

    index.remove(second.path);
    expect(index.knownTags()).toEqual(["cycling"]);

    index.remove(first.path);
    contents.set(moved, "- [x] 3 #language-lessons");
    await index.refresh(moved as never);
    expect(index.knownTags()).toEqual(["language-lessons"]);
  });
});
