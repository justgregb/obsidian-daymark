import { describe, expect, it } from "vitest";
import { markdownFilesInFolder } from "../src/vault-files";
import { fakeFile, fakeFolder } from "./obsidian-fakes";

describe("folder-scoped Markdown discovery", () => {
  it("walks only the configured folder and its descendants", () => {
    const first = fakeFile("Journal/2026-08-20.md");
    const second = fakeFile("Journal/Archive/2025-01-01.md");
    const image = fakeFile("Journal/cover.jpg");
    const journal = fakeFolder("Journal", [first, fakeFolder("Journal/Archive", [second]), image]);
    const root = fakeFolder("", [journal, fakeFile("Desk/private.md")]);
    const vault = {
      getFolderByPath: (path: string) => path === "Journal" ? journal : null,
      getRoot: () => root
    } as unknown as Parameters<typeof markdownFilesInFolder>[0];

    expect(markdownFilesInFolder(vault, "Journal").map((file) => file.path)).toEqual([
      "Journal/2026-08-20.md",
      "Journal/Archive/2025-01-01.md"
    ]);
  });

  it("supports an explicitly configured vault root", () => {
    const root = fakeFolder("", [fakeFile("2026-08-20.md"), fakeFile("cover.png")]);
    const vault = {
      getFolderByPath: () => null,
      getRoot: () => root
    } as unknown as Parameters<typeof markdownFilesInFolder>[0];

    expect(markdownFilesInFolder(vault, "").map((file) => file.path)).toEqual(["2026-08-20.md"]);
  });

  it("returns no files when the configured folder does not exist", () => {
    const vault = {
      getFolderByPath: () => null,
      getRoot: () => fakeFolder("")
    } as unknown as Parameters<typeof markdownFilesInFolder>[0];

    expect(markdownFilesInFolder(vault, "Missing")).toEqual([]);
  });
});
