import { describe, expect, it } from "vitest";
import {
  AdditionalWordIndex,
  additionalWordFolderLabel,
  pathIsInAdditionalWordFolder
} from "../src/additional-word-index";

interface FakeFile {
  path: string;
}

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
    const files: FakeFile[] = [
      { path: "Desk/Longform/Novel.md" },
      { path: "Desk/Longform/Act 1/Scene.md" },
      { path: "Desk/Longform/Tally — 2026.md" },
      { path: "Desk/Inbox/Other.md" }
    ];
    const contents = new Map<string, string>([
      ["Desk/Longform/Novel.md", "---\ntype: draft\n---\n# Opening\nOne two three.\n- ignored list words"],
      ["Desk/Longform/Act 1/Scene.md", "Γεια σου"],
      ["Desk/Longform/Tally — 2026.md", "These words must not count"],
      ["Desk/Inbox/Other.md", "Nor should these words"]
    ]);
    const app = {
      vault: {
        getMarkdownFiles: () => files,
        cachedRead: async (file: FakeFile) => contents.get(file.path) ?? ""
      }
    } as unknown as ConstructorParameters<typeof AdditionalWordIndex>[0];
    const index = new AdditionalWordIndex(app, () => "Desk/Longform", () => "en-US");

    await index.rebuild();
    expect(index.totalWords).toBe(6);

    contents.set("Desk/Longform/Novel.md", "One two");
    await index.refresh(files[0] as never);
    expect(index.totalWords).toBe(4);

    index.remove("Desk/Longform/Act 1/Scene.md");
    expect(index.totalWords).toBe(2);

    files.splice(0, files.length, { path: "Desk/Longform/Replacement.md" });
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
        getMarkdownFiles: () => {
          scans += 1;
          return [];
        }
      }
    } as unknown as ConstructorParameters<typeof AdditionalWordIndex>[0];
    const index = new AdditionalWordIndex(app, () => "", () => "en-US");

    await index.rebuild();

    expect(scans).toBe(0);
    expect(index.totalWords).toBe(0);
  });
});
