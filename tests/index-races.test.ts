import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { DaymarkIndex } from "../src/indexer";
import { AdditionalWordIndex } from "../src/additional-word-index";
import { DEFAULT_SETTINGS } from "../src/types";
import { fakeFile, fakeFolder } from "./obsidian-fakes";

function fixture(kind: "daily" | "additional") {
  const file = fakeFile("Journal/2026-09-25.md");
  const files = [file];
  const releases: Array<(content: string) => void> = [];
  const read = vi.fn(() => new Promise<string>(resolve => releases.push(resolve)));
  const app = { vault: { getFolderByPath: () => fakeFolder("Journal", files), cachedRead: read } } as unknown as App;
  const index = kind === "daily"
    ? new DaymarkIndex(app, () => ({ ...DEFAULT_SETTINGS, dateFormat: "YYYY-MM-DD" }), () => "en")
    : new AdditionalWordIndex(app, () => "Journal", () => "en");
  const words = () => index instanceof DaymarkIndex
    ? index.recordForDate({ year: 2026, month: 9, day: 25 })?.words ?? 0 : index.totalWords;
  return { index, file, files, read, releases, words };
}

describe.each(["daily", "additional"] as const)("%s index read races", kind => {
  it("does not let an older refresh overwrite a newer edit", async () => {
    const f = fixture(kind);
    const older = f.index.refresh(f.file), newer = f.index.refresh(f.file);
    f.releases[1]("The current note has six words"); await newer;
    f.releases[0]("Old"); await older;
    expect(f.words()).toBe(6);
  });
  it("does not restore a deleted note after a pending refresh", async () => {
    const f = fixture(kind);
    const pending = f.index.refresh(f.file);
    f.index.remove(f.file.path);
    f.releases[0]("Deleted note"); await pending;
    expect(f.index.has(f.file.path)).toBe(false);
  });
  it("keeps a refreshed record when an older full scan finishes", async () => {
    const f = fixture(kind);
    const scanning = f.index.rebuild(), editing = f.index.refresh(f.file);
    f.releases[1]("The current note has six words"); await editing;
    f.releases[0]("Old"); await scanning;
    expect(f.words()).toBe(6);
    expect(f.read).toHaveBeenCalledTimes(2);
  });
  it("keeps a removed record out of an in-flight scan", async () => {
    const f = fixture(kind);
    const scanning = f.index.rebuild();
    f.index.remove(f.file.path);
    f.releases[0]("Deleted note"); await scanning;
    expect(f.index.has(f.file.path)).toBe(false);
  });
  it("includes a new note created after the scan took its file list", async () => {
    const f = fixture(kind);
    const scanning = f.index.rebuild();
    const added = fakeFile("Journal/2026-09-26.md");
    const editing = f.index.refresh(added);
    f.releases[1]("New note"); await editing;
    f.releases[0]("Original note"); await scanning;
    expect(f.index.has(added.path)).toBe(true);
    expect(f.read).toHaveBeenCalledTimes(2);
  });
  it("ignores a file renamed after its scan read but before the scan commits", async () => {
    const f = fixture(kind);
    f.files.push(fakeFile("Journal/2026-09-26.md"));
    const scanning = f.index.rebuild();
    f.releases[0]("Moved away"); await Promise.resolve(); await Promise.resolve();
    f.file.path = "Elsewhere/2026-09-25.md";
    f.releases[1](""); await scanning;
    expect(f.words()).toBe(0);
    expect(f.index.has("Journal/2026-09-25.md")).toBe(false);
  });
  it("releases scan and refresh bookkeeping after successful and failed reads", async () => {
    const f = fixture(kind);
    f.read.mockImplementation(() => Promise.reject(new Error("Read failed")));
    await expect(f.index.rebuild()).rejects.toThrow("Read failed");
    await expect(f.index.refresh(f.file)).rejects.toThrow("Read failed");
    const state = f.index as unknown as { scanChanges: unknown; reads: { latestByPath: Map<string, number> } };
    expect(state.scanChanges).toBeNull();
    expect(state.reads.latestByPath.size).toBe(0);
    f.read.mockImplementation(() => Promise.resolve("Recovered"));
    for (let i = 0; i < 100; i++) await f.index.refresh(f.file);
    expect(state.reads.latestByPath.size).toBe(0);
    await f.index.rebuild();
    expect(state.scanChanges).toBeNull();
    expect(f.words()).toBe(1);
  });
  it("does not attach a renamed file to its former date or scan path", async () => {
    const f = fixture(kind);
    const scanning = f.index.rebuild();
    f.file.path = "Elsewhere/2026-09-26.md";
    f.releases[0]("Moved away"); await scanning;
    expect(f.words()).toBe(0);
    expect(f.index.has(f.file.path)).toBe(false);
  });
});
