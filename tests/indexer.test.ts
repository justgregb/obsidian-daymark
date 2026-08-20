import { describe, expect, it } from "vitest";
import type { TFile } from "obsidian";
import { getPeriodBounds } from "../src/date";
import { DaymarkIndex } from "../src/indexer";
import type { DaymarkSettings } from "../src/types";
import { fakeFile, fakeFolder } from "./obsidian-fakes";

describe("daily-note index", () => {
  it("rebuilds only from Markdown files inside the configured journal folder", async () => {
    const firstPath = "Journal/2026/08/2026-08-10.md";
    const secondPath = "Journal/2026/08/2026-08-12.md";
    const first = fakeFile(firstPath);
    const second = fakeFile(secondPath);
    const journal = fakeFolder("Journal", [
      fakeFolder("Journal/2026", [fakeFolder("Journal/2026/08", [first, second])])
    ]);
    const contents = new Map<TFile, string>([
      [first, "One two\n![[cover.jpg]]"],
      [second, "Three four five\n![Detail](Assets/detail.png)"]
    ]);
    const reads: string[] = [];
    const app = {
      vault: {
        getFolderByPath: (path: string) => path === "Journal" ? journal : null,
        getRoot: () => fakeFolder(""),
        cachedRead: async (file: TFile) => {
          reads.push(file.path);
          return contents.get(file) ?? "";
        }
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
    expect(reads).toEqual([firstPath, secondPath]);
    expect(index.isReady).toBe(true);
  });

  it("tracks known completed-item tags through incremental changes", async () => {
    const first = fakeFile("Journal/2026-08-10.md");
    const second = fakeFile("Journal/2026-08-11.md");
    const moved = fakeFile("Journal/2026-08-12.md");
    const journal = fakeFolder("Journal", [first, second]);
    const contents = new Map<TFile, string>([
      [first, "- [x] 100 #pushups\n- [ ] 5 #unchecked"],
      [second, "- [X] 6 #running"]
    ]);
    const app = {
      vault: {
        getFolderByPath: (path: string) => path === "Journal" ? journal : null,
        getRoot: () => fakeFolder(""),
        cachedRead: async (file: TFile) => contents.get(file) ?? ""
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
    await index.refresh(first);
    expect(index.knownTags()).toEqual(["cycling", "running"]);

    index.remove(second.path);
    expect(index.knownTags()).toEqual(["cycling"]);

    index.remove(first.path);
    contents.set(moved, "- [x] 3 #language-lessons");
    await index.refresh(moved);
    expect(index.knownTags()).toEqual(["language-lessons"]);
  });
});
