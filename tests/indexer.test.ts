import { describe, expect, it, vi } from "vitest";
import type { TFile } from "obsidian";
import { getPeriodBounds } from "../src/date";
import { DaymarkIndex } from "../src/indexer";
import { DEFAULT_SETTINGS, type DaymarkSettings } from "../src/types";
import { fakeFile, fakeFolder } from "./obsidian-fakes";

describe("daily-note index", () => {
  it("stops the old journal scan and restarts after a source change", async () => {
    let settings = { ...DEFAULT_SETTINGS, journalFolder: "Journal", dateFormat: "YYYY-MM-DD" };
    const oldFiles = Array.from({ length: 20 }, (_, index) => fakeFile(`Journal/2026-09-${String(index + 1).padStart(2, "0")}.md`));
    const next = fakeFile("Diary/2026-09-25.md");
    const releases: Array<(content: string) => void> = [];
    const read = vi.fn((file: TFile) => file === next ? Promise.resolve("Current journal") : new Promise<string>(resolve => releases.push(resolve)));
    const app = { vault: { getFolderByPath: (path: string) => fakeFolder(path, path === "Journal" ? oldFiles : [next]), cachedRead: read } } as unknown as ConstructorParameters<typeof DaymarkIndex>[0];
    const index = new DaymarkIndex(app, () => settings, () => "en");
    const pending = index.rebuild(); settings = { ...settings, journalFolder: "Diary" };
    releases.forEach(resolve => resolve("Old journal")); await pending;
    expect(read).toHaveBeenCalledTimes(9);
    expect(index.has(oldFiles[0].path)).toBe(false);
    expect(index.recordForDate({ year: 2026, month: 9, day: 25 })?.words).toBe(2);
  });
  it("stops queued reads and discards in-flight results when disposed", async () => {
    const files = Array.from({ length: 20 }, (_, index) => fakeFile(`Journal/2026-09-${String(index + 1).padStart(2, "0")}.md`));
    const releases: Array<(content: string) => void> = [];
    const read = vi.fn(() => new Promise<string>(resolve => releases.push(resolve)));
    const app = { vault: { getFolderByPath: () => fakeFolder("Journal", files), cachedRead: read } } as unknown as ConstructorParameters<typeof DaymarkIndex>[0];
    const index = new DaymarkIndex(app, () => ({ ...DEFAULT_SETTINGS, journalFolder: "Journal", dateFormat: "YYYY-MM-DD" }), () => "en");
    const loading = index.ensureReady();
    expect(read).toHaveBeenCalledTimes(8);
    index.dispose();
    releases.forEach(resolve => resolve("These late words must not return"));
    await loading;
    await index.ensureReady(); await index.rebuild(); await index.refresh(files[0]);
    expect(read).toHaveBeenCalledTimes(8);
    expect(index.isReady).toBe(false);
    expect(index.recordForDate({ year: 2026, month: 9, day: 1 })).toBeNull();
  });
  it("does not resurrect a record from an incremental read after disposal", async () => {
    const file = fakeFile("Journal/2026-09-25.md");
    let release!: (content: string) => void;
    const app = { vault: { cachedRead: () => new Promise<string>(resolve => { release = resolve; }) } } as unknown as ConstructorParameters<typeof DaymarkIndex>[0];
    const index = new DaymarkIndex(app, () => ({ ...DEFAULT_SETTINGS, journalFolder: "Journal", dateFormat: "YYYY-MM-DD" }), () => "en");
    const pending = index.refresh(file);
    index.dispose(); release("Too late"); await pending;
    expect(index.has(file.path)).toBe(false);
  });
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
      settingsVersion: 4,
      calendarLayout: "standard",
      dayNames: {},
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
      settingsVersion: 4,
      calendarLayout: "standard",
      dayNames: {},
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

  it("reruns a rebuild requested while an earlier rebuild is reading", async () => {
    const file = fakeFile("Journal/2026-08-10.md");
    const journal = fakeFolder("Journal", [file]);
    let reads = 0;
    let releaseFirstRead!: () => void;
    const firstRead = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    const app = {
      vault: {
        getFolderByPath: (path: string) => path === "Journal" ? journal : null,
        getRoot: () => fakeFolder(""),
        cachedRead: async () => {
          reads += 1;
          if (reads === 1) await firstRead;
          return reads === 1 ? "One" : "One two";
        }
      }
    } as unknown as ConstructorParameters<typeof DaymarkIndex>[0];
    const settings: DaymarkSettings = {
      settingsVersion: 4,
      calendarLayout: "standard",
      dayNames: {},
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

    const first = index.rebuild();
    await Promise.resolve();
    const requested = index.rebuild();
    releaseFirstRead();
    await Promise.all([first, requested]);

    const aggregate = index.aggregate(getPeriodBounds({ year: 2026, month: 8, day: 10 }, "month", 1));
    expect(reads).toBe(2);
    expect(aggregate.words).toBe(2);
  });
});
