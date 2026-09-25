import { describe, expect, it, vi } from "vitest";
import type { App, TFile } from "obsidian";
import { LinkedWritingIndex } from "../src/linked-writing-index";
import { DaymarkIndex } from "../src/indexer";
import { DEFAULT_SETTINGS, type DaymarkSettings } from "../src/types";
import { getPeriodBounds } from "../src/date";
import { fakeFile, fakeFolder } from "./obsidian-fakes";

function setup() {
  const first = fakeFile("Journal/2026-09-20.md");
  const second = fakeFile("Journal/2026-09-21.md");
  const essay = fakeFile("Desk/Essay.md");
  const remote = fakeFile("Desk/Indirect.md");
  const photo = fakeFile("Assets/photo.jpg");
  const files = new Map([first, second, essay, remote, photo].map((file) => [file.path, file]));
  const contents = new Map([[first.path, "Daily prose"], [second.path, "Other day"], [essay.path, "Three prose words"], [remote.path, "Indirect content"]]);
  const links: Record<string, Record<string, number>> = {
    [first.path]: { [essay.path]: 4, [first.path]: 1, [photo.path]: 1, "https://example.com": 1, "Missing.md": 1 },
    [second.path]: { [essay.path]: 1 },
    [essay.path]: { [remote.path]: 1 }
  };
  const read = vi.fn(async (file: TFile) => contents.get(file.path) ?? "");
  const app = {
    metadataCache: { resolvedLinks: links },
    vault: {
      cachedRead: read,
      getAbstractFileByPath: (path: string) => files.get(path) ?? null,
      getFolderByPath: () => fakeFolder("Journal", [first, second]),
      getRoot: () => fakeFolder("")
    }
  } as unknown as App;
  return { app, first, second, essay, remote, files, contents, links, read, index: new LinkedWritingIndex(app, () => "en") };
}

describe("direct linked writing", () => {
  it("ignores a failed linked read that completes after disposal", async () => {
    const { index, first, read } = setup();
    let reject!: (error: Error) => void;
    read.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const pending = index.rebuild([first]);
      index.dispose(); reject(new Error("Stale read")); await pending;
      expect(warning).not.toHaveBeenCalled();
      expect(index.notesFor(first.path)).toEqual([]);
    } finally { warning.mockRestore(); }
  });
  it("retains sorted titles and dependencies when only resolved-link order or multiplicity changes", async () => {
    const { index, first, essay, remote, links, read, contents } = setup();
    links[first.path] = { [essay.path]: 1, [remote.path]: 1 };
    await index.rebuild([first]);
    const titles = index.notesFor(first.path);
    links[first.path] = { [remote.path]: 5, [essay.path]: 2 };
    read.mockClear();
    const sorting = vi.spyOn(String.prototype, "localeCompare");
    try {
      expect(await index.refreshSource(first)).toBe(false);
      expect(sorting).not.toHaveBeenCalled();
    } finally { sorting.mockRestore(); }
    expect(index.notesFor(first.path)).toBe(titles);
    expect(read).not.toHaveBeenCalled();
    contents.set(essay.path, "One two three four");
    await index.refreshTarget(essay);
    expect(index.summary(first.path).linkedWords).toBe(6);
    expect(index.sourcesFor(essay.path)).toEqual([first.path]);
  });
  it("reorders linked titles after a locale change", async () => {
    const { app, first, links, files } = setup();
    const umlaut = fakeFile("Books/ä.md"), z = fakeFile("Books/z.md");
    files.set(umlaut.path, umlaut); files.set(z.path, z);
    links[first.path] = { [umlaut.path]: 1, [z.path]: 1 };
    let locale = "en";
    const index = new LinkedWritingIndex(app, () => locale, () => 0);
    await index.rebuild([first]);
    expect(index.notesFor(first.path).map(note => note.title)).toEqual(["ä", "z"]);
    locale = "sv";
    expect(await index.refreshSource(first)).toBe(true);
    expect(index.notesFor(first.path).map(note => note.title)).toEqual(["z", "ä"]);
  });
  it("exposes sorted, deduplicated local titles without additional reads", async () => {
    const { index, first, second, essay, remote, links, read } = setup();
    links[first.path][remote.path] = 3;
    await index.rebuild([first, second]);
    const notes = index.notesFor(first.path);
    expect(notes).toEqual([{ path: essay.path, title: "Essay" }, { path: remote.path, title: "Indirect" }]);
    read.mockClear();
    expect(await index.refreshSource(first)).toBe(false);
    expect(index.notesFor(first.path)).toBe(notes);
    expect(read).not.toHaveBeenCalled();
  });
  it("refreshes a title when its destination changes but the writing totals do not", async () => {
    const { index, first, remote, contents, links } = setup();
    await index.rebuild([first]);
    contents.set(remote.path, "Three more words");
    links[first.path] = { [remote.path]: 1 };
    expect(await index.refreshSource(first)).toBe(true);
    expect(index.summary(first.path)).toEqual({ linkedWords: 3, linkedNoteCount: 1 });
    expect(index.notesFor(first.path)).toEqual([{ path: remote.path, title: "Indirect" }]);
  });
  it("offers linked titles while their word counts are pending or unavailable", async () => {
    const { index, first, essay, read } = setup();
    let reject!: (error: Error) => void;
    read.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pending = index.rebuild([first]);
    expect(index.notesFor(first.path)).toEqual([{ path: essay.path, title: "Essay" }]);
    reject(new Error("Read failed")); await pending;
    expect(index.notesFor(first.path)).toHaveLength(1);
    expect(index.summary(first.path).linkedWritingStatus).toBe("unavailable");
    warning.mockRestore();
  });
  it("removes a deleted destination from all linked titles immediately", async () => {
    const { index, first, second, essay } = setup();
    await index.rebuild([first, second]);
    index.remove(essay.path);
    expect(index.notesFor(first.path)).toEqual([]);
    expect(index.notesFor(second.path)).toEqual([]);
    expect(index.sourcesFor(essay.path)).toEqual([]);
  });
  it("marks queued targets as loading and reports progress to every dependent day", async () => {
    const { index, first, second, files, links, read } = setup();
    const targets = Array.from({ length: 9 }, (_, i) => fakeFile(`Desk/Pending ${i}.md`));
    targets.forEach(file => files.set(file.path, file));
    links[first.path] = Object.fromEntries(targets.map(file => [file.path, 1]));
    links[second.path] = { [targets[8].path]: 1 };
    const releases: Array<(value: string) => void> = [];
    read.mockImplementation(() => new Promise(resolve => releases.push(resolve)));
    const progress = vi.fn();
    const ready = index.rebuild([first, second], undefined, progress);
    expect(read).toHaveBeenCalledTimes(8);
    expect(index.summary(second.path).linkedWritingStatus).toBe("loading");
    releases.forEach(release => release("One two"));
    await vi.waitFor(() => expect(releases).toHaveLength(9));
    expect(index.summary(first.path)).toMatchObject({ linkedWords: 16, linkedWritingStatus: "loading" });
    releases[8]("Three words here");
    await ready;
    expect(progress).toHaveBeenLastCalledWith([first.path, second.path]);
    expect(index.summary(first.path)).toEqual({ linkedWords: 19, linkedNoteCount: 9 });
  });
  it("does not publish stale background progress after disposal or another rebuild", async () => {
    const { index, first, read } = setup();
    let release!: (value: string) => void;
    read.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const progress = vi.fn();
    const ready = index.rebuild([first], undefined, progress);
    index.dispose(); release("Old result"); await ready;
    expect(progress).not.toHaveBeenCalled();
  });
  it("does no file reads or timer yields for known daily words or unchanged metadata", async () => {
    const { index, first, second, links, read } = setup();
    links[first.path] = { [second.path]: 1 };
    links[second.path] = { [first.path]: 1 };
    const timeout = vi.fn((callback: () => void) => { callback(); return 0; });
    vi.stubGlobal("window", { setTimeout: timeout });
    try {
      await index.rebuild([first, second], new Map([[first.path, 20], [second.path, 40]]));
      expect(await index.refreshSource(first)).toBe(false);
      expect(await index.refreshSource(second)).toBe(false);
      expect(read).not.toHaveBeenCalled();
      expect(timeout).not.toHaveBeenCalled();
      expect(index.summary(first.path).linkedWords).toBe(40);
    } finally { vi.unstubAllGlobals(); }
  });
  it("reports actual resolved-link changes while ignoring repeat metadata notifications", async () => {
    const { index, first, essay, links } = setup();
    links[first.path] = {};
    await index.rebuild([first]);
    expect(await index.refreshSource(first)).toBe(false);
    links[first.path] = { [essay.path]: 1 };
    expect(await index.refreshSource(first)).toBe(true);
    expect(await index.refreshSource(first)).toBe(false);
    links[first.path] = {};
    expect(await index.refreshSource(first)).toBe(true);
  });
  it("cancels queued reads from an older rebuild instead of reusing its stale known words", async () => {
    const { index, first, files, links, read } = setup();
    const targets = Array.from({ length: 9 }, (_, i) => fakeFile(`Desk/Target ${i}.md`));
    for (const file of targets) files.set(file.path, file);
    links[first.path] = Object.fromEntries(targets.map(file => [file.path, 1]));
    const oldReads: Array<(value: string) => void> = [];
    const newReads: Array<(value: string) => void> = [];
    let calls = 0;
    read.mockImplementation(() => new Promise(resolve => { (calls++ < 8 ? oldReads : newReads).push(resolve); }));
    const older = index.rebuild([first], new Map([[targets[8].path, 999]]));
    const newer = index.rebuild([first], new Map([[targets[8].path, 42]]));
    for (const release of oldReads) release("Old prose");
    await older;
    for (const release of newReads) release("Fresh prose");
    await newer;
    expect(index.summary(first.path)).toEqual({ linkedWords: 58, linkedNoteCount: 9 });
  });
  it("counts repeated links once, shares reads, and excludes self, missing, remote, image, and transitive links", async () => {
    const { index, first, second, essay, read } = setup();
    await index.rebuild([first, second], new Map());
    expect(index.summary(first.path)).toEqual({ linkedWords: 3, linkedNoteCount: 1 });
    expect(index.summary(second.path)).toEqual({ linkedWords: 3, linkedNoteCount: 1 });
    expect(read.mock.calls.map(([file]) => file.path)).toEqual([essay.path]);
    expect(index.sourcesFor(essay.path)).toEqual([first.path, second.path]);
  });

  it("reuses known daily-note word counts and stops at one hop even with cycles", async () => {
    const { index, first, second, links, read } = setup();
    links[first.path] = { [second.path]: 3 };
    links[second.path] = { [first.path]: 2 };
    await index.rebuild([first, second], new Map([[first.path, 20], [second.path, 40]]));
    expect(index.summary(first.path).linkedWords).toBe(40);
    expect(index.summary(second.path).linkedWords).toBe(20);
    expect(read).not.toHaveBeenCalled();
  });

  it("refreshes all dependent days when linked prose changes and preserves Markdown exclusions", async () => {
    const { index, first, second, essay, contents } = setup();
    await index.rebuild([first, second], new Map());
    contents.set(essay.path, "---\ntitle: ignored\n---\nNew words\n- [ ] Not prose\n```\nIgnore code\n```\n![[photo.jpg]]");
    await index.refreshTarget(essay);
    expect(index.summary(first.path).linkedWords).toBe(2);
    expect(index.summary(second.path).linkedWords).toBe(2);
  });

  it("handles newly resolved links and prunes removed dependencies without reading the source note", async () => {
    const { index, first, essay, links, read } = setup();
    links[first.path] = {};
    await index.rebuild([first], new Map());
    expect(read).not.toHaveBeenCalled();
    links[first.path] = { [essay.path]: 2 };
    await index.refreshSource(first);
    expect(index.summary(first.path).linkedWords).toBe(3);
    links[first.path] = {};
    await index.refreshSource(first);
    expect(index.sourcesFor(essay.path)).toEqual([]);
    expect(index.summary(first.path).linkedWords).toBe(0);
    expect(read.mock.calls.map(([file]) => file.path)).toEqual([essay.path]);
  });

  it("removes deleted targets and follows Obsidian's resolved destination after rename", async () => {
    const { index, first, essay, files, links, contents } = setup();
    await index.rebuild([first], new Map());
    files.delete(essay.path);
    index.remove(essay.path);
    expect(index.summary(first.path)).toEqual({ linkedWords: 0, linkedNoteCount: 0 });
    const renamed = fakeFile("Desk/Renamed.md");
    files.set(renamed.path, renamed);
    contents.set(renamed.path, "Renamed prose");
    links[first.path] = { [renamed.path]: 1 };
    await index.refreshSource(first);
    expect(index.summary(first.path).linkedWords).toBe(2);
    expect(index.sourcesFor(essay.path)).toEqual([]);
  });

  it("does not let an old in-flight read overwrite a newer result", async () => {
    const { index, first, essay, read } = setup();
    let release!: (content: string) => void;
    read.mockImplementationOnce(() => new Promise<string>((resolve) => { release = resolve; }));
    const initial = index.rebuild([first], new Map());
    await Promise.resolve();
    await index.refreshTarget(essay, 12);
    release("Old prose");
    await initial;
    expect(index.summary(first.path).linkedWords).toBe(12);
  });

  it("discards pending reads and subscriptions after disposal", async () => {
    const { index, first, essay, read } = setup();
    let release!: (content: string) => void;
    read.mockImplementationOnce(() => new Promise<string>((resolve) => { release = resolve; }));
    const initial = index.rebuild([first], new Map());
    await Promise.resolve();
    index.dispose();
    release("Prose after disposal");
    await initial;
    await index.refreshSource(first);
    await index.refreshTarget(essay);
    expect(index.summary(first.path).linkedWords).toBe(0);
    expect(index.sourcesFor(essay.path)).toEqual([]);
    expect(read).toHaveBeenCalledOnce();
  });

  it("skips an unreadable target without breaking the calendar and retries on refresh", async () => {
    const { index, first, essay, read } = setup();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      read.mockRejectedValueOnce(new Error("Unavailable"));
      await index.rebuild([first], new Map());
      expect(index.summary(first.path)).toMatchObject({ linkedWords: 0, linkedWritingStatus: "unavailable" });
      await index.refreshTarget(essay);
      expect(index.summary(first.path)).toEqual({ linkedWords: 3, linkedNoteCount: 1 });
    } finally { warning.mockRestore(); }
  });
});

describe("linked writing in the daily-note index", () => {
  it("reuses the existing daily index for a newly resolved daily-note link", async () => {
    const { app, first, second, links, read } = setup();
    links[first.path] = {}; links[second.path] = {};
    const index = new DaymarkIndex(app, () => ({ ...DEFAULT_SETTINGS, journalFolder: "Journal", calendarLayout: "margin" }), () => "en");
    await index.ensureReady();
    read.mockClear();
    links[first.path] = { [second.path]: 1 };
    expect(await index.refreshLinks(first)).toBe(true);
    expect(index.recordForDate({ year: 2026, month: 9, day: 20 })).toMatchObject({ linkedWords: 2, linkedNoteCount: 1 });
    expect(await index.refreshLinks(first)).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });
  it("loads linked targets only for Margin and releases them when Standard returns", async () => {
    const { app, essay, read } = setup();
    const settings: DaymarkSettings = { ...DEFAULT_SETTINGS, journalFolder: "Journal" };
    const index = new DaymarkIndex(app, () => settings, () => "en");
    await index.ensureReady();
    expect(read.mock.calls.some(([file]) => file.path === essay.path)).toBe(false);
    settings.calendarLayout = "margin";
    await index.rebuildMarginWriting();
    expect(read.mock.calls.filter(([file]) => file.path === essay.path)).toHaveLength(1);
    expect(index.linkedDatesForPath(essay.path)).toHaveLength(2);
    settings.calendarLayout = "standard";
    await index.rebuildMarginWriting();
    expect(index.linkedDatesForPath(essay.path)).toEqual([]);
    expect(index.recordForDate({ year: 2026, month: 9, day: 20 })?.linkedWords).toBeUndefined();
  });

  it("updates dependent dates without adding linked prose to Tally totals", async () => {
    const { app, first, essay, contents, links, read } = setup();
    const settings = { ...DEFAULT_SETTINGS, journalFolder: "Journal", calendarLayout: "margin" as const };
    const index = new DaymarkIndex(app, () => settings, () => "en");
    const date = { year: 2026, month: 9, day: 20 };
    await index.ensureReady();
    expect(index.recordForDate(date)).toMatchObject({ words: 2, linkedWords: 3, linkedNoteCount: 1 });
    expect(index.aggregate(getPeriodBounds(date, "month", 1)).words).toBe(4);
    contents.set(essay.path, "One two three four five");
    await index.refresh(essay);
    expect(index.recordForDate(date)?.linkedWords).toBe(5);
    expect(index.linkedDatesForPath(essay.path)).toEqual(["2026-09-20", "2026-09-21"]);
    const reads = read.mock.calls.length;
    links[first.path] = {};
    await index.refreshLinks(first);
    expect(index.recordForDate(date)?.linkedWords).toBe(0);
    expect(read).toHaveBeenCalledTimes(reads);
  });

  it("exposes daily dates before linked reads finish, then publishes complete writing totals", async () => {
    const { app, essay, read, contents } = setup();
    let release!: (content: string) => void;
    const started = new Promise<void>((resolve) => {
      read.mockImplementation((file) => file.path === essay.path
        ? new Promise<string>((done) => { release = done; resolve(); })
        : Promise.resolve(contents.get(file.path) ?? ""));
    });
    const changed = vi.fn();
    const index = new DaymarkIndex(app, () => ({ ...DEFAULT_SETTINGS, journalFolder: "Journal", calendarLayout: "margin" }), () => "en", changed);
    const ready = index.ensureReady();
    await started;
    await ready;
    expect(index.isReady).toBe(true);
    expect(index.recordForDate({ year: 2026, month: 9, day: 20 })).toMatchObject({ words: 2, linkedWords: 0, linkedWritingStatus: "loading" });
    release("Linked prose");
    await index.whenWritingReady();
    expect(changed).toHaveBeenCalledExactlyOnceWith(["2026-09-20", "2026-09-21"]);
    expect(index.recordForDate({ year: 2026, month: 9, day: 20 })).toMatchObject({ words: 2, linkedWords: 2 });
    expect(index.recordForDate({ year: 2026, month: 9, day: 20 })?.linkedWritingStatus).toBeUndefined();
  });
});
