import { describe, expect, it, vi } from "vitest";
import type { TFile } from "obsidian";
import {
  AdditionalWordIndex,
  additionalWordFolderLabel,
  pathIsInAdditionalWordFolder
} from "../src/additional-word-index";
import { fakeFile, fakeFolder } from "./obsidian-fakes";

describe("additional word-count folder", () => {
  it("discards an incremental read after a reset or folder change", async () => {
    const file = fakeFile("Drafts/Story.md");
    let folder = "Drafts";
    let release!: (content: string) => void;
    const app = { vault: { cachedRead: () => new Promise<string>(resolve => { release = resolve; }) } } as unknown as ConstructorParameters<typeof AdditionalWordIndex>[0];
    const index = new AdditionalWordIndex(app, () => folder, () => "en");
    const pending = index.refresh(file);
    index.reset(); folder = "Other";
    release("Stale words"); await pending;
    expect(index.totalWords).toBe(0);
    expect(index.has(file.path)).toBe(false);
  });
  it("stops queued reads and makes future work inert after disposal", async () => {
    const files = Array.from({ length: 20 }, (_, index) => fakeFile(`Drafts/${index}.md`));
    const releases: Array<(content: string) => void> = [];
    const read = vi.fn(() => new Promise<string>(resolve => releases.push(resolve)));
    const app = { vault: { getFolderByPath: () => fakeFolder("Drafts", files), cachedRead: read } } as unknown as ConstructorParameters<typeof AdditionalWordIndex>[0];
    const index = new AdditionalWordIndex(app, () => "Drafts", () => "en");
    const pending = index.ensureReady();
    expect(read).toHaveBeenCalledTimes(8);
    index.dispose(); releases.forEach(resolve => resolve("Late result")); await pending;
    await index.ensureReady(); await index.rebuild(); await index.refresh(files[0]);
    expect(read).toHaveBeenCalledTimes(8);
    expect(index.totalWords).toBe(0);
    expect(index.isReady).toBe(false);
  });
  it("restarts with the new folder instead of finishing a stale folder scan", async () => {
    let folder = "Drafts";
    const oldFiles = Array.from({ length: 20 }, (_, index) => fakeFile(`Drafts/${index}.md`));
    const next = fakeFile("Other/New.md");
    const releases: Array<(content: string) => void> = [];
    const read = vi.fn((file: TFile) => file === next ? Promise.resolve("New folder words") : new Promise<string>(resolve => releases.push(resolve)));
    const app = { vault: { getFolderByPath: (path: string) => fakeFolder(path, path === "Drafts" ? oldFiles : [next]), cachedRead: read } } as unknown as ConstructorParameters<typeof AdditionalWordIndex>[0];
    const index = new AdditionalWordIndex(app, () => folder, () => "en");
    const pending = index.rebuild(); folder = "Other";
    releases.forEach(resolve => resolve("Old words")); await pending;
    expect(read).toHaveBeenCalledTimes(9);
    expect(index.totalWords).toBe(3);
    expect(index.has(oldFiles[0].path)).toBe(false);
    expect(index.has(next.path)).toBe(true);
  });
  it("matches Markdown files recursively without leaking across folder boundaries", () => {
    expect(pathIsInAdditionalWordFolder("Desk/Longform/Novel.md", "Desk/Longform")).toBe(true);
    expect(pathIsInAdditionalWordFolder("Desk/Longform/Act 1/Scene.md", "Desk/Longform/")).toBe(true);
    expect(pathIsInAdditionalWordFolder("Desk/Longformer/Novel.md", "Desk/Longform")).toBe(false);
    expect(pathIsInAdditionalWordFolder("Desk/Longform/image.png", "Desk/Longform")).toBe(false);
    expect(pathIsInAdditionalWordFolder("Desk/Longform/Tally — 2026.md", "Desk/Longform")).toBe(false);
    expect(pathIsInAdditionalWordFolder("Desk/Longform/Novel.md", "")).toBe(false);
    expect(additionalWordFolderLabel("Desk/Longform/")).toBe("Longform");
  });

  it("builds and incrementally updates one all-time prose total", async () => {
    const novel = fakeFile("Desk/Longform/Novel.md");
    const scene = fakeFile("Desk/Longform/Act 1/Scene.md");
    const tally = fakeFile("Desk/Longform/Tally — 2026.md");
    const longform = fakeFolder("Desk/Longform", [novel, fakeFolder("Desk/Longform/Act 1", [scene]), tally]);
    const contents = new Map<string, string>([
      ["Desk/Longform/Novel.md", "---\ntype: draft\n---\n# Opening\nOne two three.\n- ignored list words"],
      ["Desk/Longform/Act 1/Scene.md", "Γεια σου"],
      ["Desk/Longform/Tally — 2026.md", "These words must not count"],
      ["Desk/Inbox/Other.md", "Nor should these words"]
    ]);
    const app = {
      vault: {
        getFolderByPath: (path: string) => path === "Desk/Longform" ? longform : null,
        getRoot: () => fakeFolder(""),
        cachedRead: async (file: TFile) => contents.get(file.path) ?? ""
      }
    } as unknown as ConstructorParameters<typeof AdditionalWordIndex>[0];
    const index = new AdditionalWordIndex(app, () => "Desk/Longform", () => "en-US");

    await index.rebuild();
    expect(index.totalWords).toBe(6);

    contents.set("Desk/Longform/Novel.md", "One two");
    await index.refresh(novel);
    expect(index.totalWords).toBe(4);

    index.remove("Desk/Longform/Act 1/Scene.md");
    expect(index.totalWords).toBe(2);

    const replacement = fakeFile("Desk/Longform/Replacement.md");
    longform.children.splice(0, longform.children.length, replacement);
    contents.set("Desk/Longform/Replacement.md", "A completely new draft");
    await index.rebuild();
    expect(index.totalWords).toBe(4);

    index.reset();
    expect(index.totalWords).toBe(0);
  });

  it("does not scan the vault when no additional folder is configured", async () => {
    let scans = 0;
    const app = {
      vault: {
        getFolderByPath: () => {
          scans += 1;
          return null;
        },
        getRoot: () => {
          scans += 1;
          return fakeFolder("");
        }
      }
    } as unknown as ConstructorParameters<typeof AdditionalWordIndex>[0];
    const index = new AdditionalWordIndex(app, () => "", () => "en-US");

    await index.rebuild();

    expect(scans).toBe(0);
    expect(index.totalWords).toBe(0);
  });

  it("does not apply an in-flight folder result after the source is disabled", async () => {
    const draft = fakeFile("Desk/Longform/Draft.md");
    const longform = fakeFolder("Desk/Longform", [draft]);
    let folder = "Desk/Longform";
    let releaseRead!: () => void;
    const readStarted = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let finishRead!: () => void;
    const readFinished = new Promise<void>((resolve) => {
      finishRead = resolve;
    });
    const app = {
      vault: {
        getFolderByPath: (path: string) => path === "Desk/Longform" ? longform : null,
        getRoot: () => fakeFolder(""),
        cachedRead: async () => {
          releaseRead();
          await readFinished;
          return "These stale words must not return";
        }
      }
    } as unknown as ConstructorParameters<typeof AdditionalWordIndex>[0];
    const index = new AdditionalWordIndex(app, () => folder, () => "en-US");

    const loading = index.ensureReady();
    await readStarted;
    folder = "";
    index.reset();
    finishRead();
    await loading;

    expect(index.isReady).toBe(true);
    expect(index.totalWords).toBe(0);
  });
});
