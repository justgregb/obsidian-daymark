import { describe, expect, it } from "vitest";
import { countMarkdownProseWords } from "../src/parser";
import { appendQuickLogEntry, createQuickLogEntry } from "../src/quick-log";

describe("Quick Log", () => {
  it("creates one timestamped prose line and compacts pasted whitespace", () => {
    const entry = createQuickLogEntry("  A thought\nworth keeping  ", new Date(2026, 7, 14, 9, 5));
    expect(entry).toBe("`09:05` — A thought worth keeping");
    expect(countMarkdownProseWords(entry, "en-US")).toBe(4);
  });

  it("adds a blank line without disturbing existing note content", () => {
    const entry = "`09:05` — A thought worth keeping";
    expect(appendQuickLogEntry("", entry)).toBe(`${entry}\n`);
    expect(appendQuickLogEntry("Existing prose.\n", entry)).toBe(`Existing prose.\n\n${entry}\n`);
    expect(appendQuickLogEntry("Existing prose.\n\n", entry)).toBe(`Existing prose.\n\n${entry}\n`);
  });

  it("rejects an empty entry", () => {
    expect(() => createQuickLogEntry("   ")).toThrow("cannot be empty");
  });
});
