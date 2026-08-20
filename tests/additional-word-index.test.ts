import { describe, expect, it } from "vitest";
import type { TFile } from "obsidian";
import {
  AdditionalWordIndex,
  additionalWordFolderLabel,
  pathIsInAdditionalWordFolder
} from "../src/additional-word-index";
import { fakeFile, fakeFolder } from "./obsidian-fakes";

describe("additional word-count folder", () => {
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
});
