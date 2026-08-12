import { describe, expect, it } from "vitest";
import { countMarkdownProseWords, countWords, parseDailyNote } from "../src/parser";

const date = { year: 2026, month: 8, day: 12 };

describe("task parsing", () => {
  it("accepts the planned tally syntax without adding prose words", () => {
    const record = parseDailyNote(
      "Journal/2026/08/2026-08-12.md",
      "2026-08-12",
      date,
      "---\ntype: daily\n---\n- [x] 160 #pushups – (40x4), feeling strong"
    );
    expect(record.words).toBe(0);
    expect(record.totalCheckboxes).toBe(1);
    expect(record.completedCheckboxes).toBe(1);
    expect(record.taggedTasks).toEqual([
      { tag: "pushups", value: 160, text: "160 #pushups – (40x4), feeling strong", line: 3 }
    ]);
  });

  it("handles nested tasks, X status, decimals, multiple tags, and duplicate tags", () => {
    const record = parseDailyNote(
      "Journal/2026-08-12.md",
      "2026-08-12",
      date,
      [
        "  - [X] 5.5 #Running #cardio #running",
        "- [x] Greek #greek",
        "- [ ] 20 #pushups"
      ].join("\n")
    );
    expect(record.completedCheckboxes).toBe(2);
    expect(record.totalCheckboxes).toBe(3);
    expect(record.taggedTasks).toEqual([
      { tag: "running", value: 5.5, text: "5.5 #Running #cardio #running", line: 0 },
      { tag: "cardio", value: 5.5, text: "5.5 #Running #cardio #running", line: 0 },
      { tag: "greek", value: 1, text: "Greek #greek", line: 1 }
    ]);
  });

  it("accepts a standalone numeric value before or after task text", () => {
    const record = parseDailyNote(
      "Journal/2026-08-12.md",
      "2026-08-12",
      date,
      [
        "- [x] Test 30 #test",
        "- [x] 30 Test #test",
        "- [X] Ran (5.5) #running"
      ].join("\n")
    );
    expect(record.taggedTasks).toEqual([
      { tag: "test", value: 30, text: "Test 30 #test", line: 0 },
      { tag: "test", value: 30, text: "30 Test #test", line: 1 },
      { tag: "running", value: 5.5, text: "Ran (5.5) #running", line: 2 }
    ]);
  });

  it("ignores invalid numeric forms while still counting completed checkboxes", () => {
    const record = parseDailyNote(
      "Journal/2026-08-12.md",
      "2026-08-12",
      date,
      [
        "- [x] -5 #running",
        "- [x] 1,000 #words",
        "- [x] `20 #pushups`",
        "- [X] 0 #meditation"
      ].join("\n")
    );
    expect(record.completedCheckboxes).toBe(4);
    expect(record.totalCheckboxes).toBe(4);
    expect(record.taggedTasks).toEqual([
      { tag: "meditation", value: 0, text: "0 #meditation", line: 3 }
    ]);
  });

  it("ignores tasks inside fenced code", () => {
    const record = parseDailyNote(
      "Journal/2026-08-12.md",
      "2026-08-12",
      date,
      "```markdown\n- [x] 100 #pushups\n```\n~~~\n- [X] 5 #running\n~~~"
    );
    expect(record.completedCheckboxes).toBe(0);
    expect(record.totalCheckboxes).toBe(0);
    expect(record.taggedTasks).toEqual([]);
  });
});

describe("journal prose word count", () => {
  it("counts multilingual prose", () => {
    expect(countWords("Hello κόσμε Привет мир", "en-US")).toBe(4);
  });

  it("excludes metadata and non-prose constructs while preserving visible link labels", () => {
    const record = parseDailyNote(
      "Journal/2026-08-12.md",
      "2026-08-12",
      date,
      [
        "---",
        "type: daily",
        "---",
        "# A clear heading",
        "Read [good writing](https://example.com) and [[Bird by Bird|this book]].",
        "<!-- hidden comment words -->",
        "Inline `ignored code words` and https://example.com/path.",
        "![ignored image](image.png)",
        "- ordinary list words",
        "1. numbered list words",
        "```",
        "fenced code words",
        "```"
      ].join("\n"),
      "en-US"
    );
    expect(record.words).toBe(11);
    expect(countMarkdownProseWords([
      "---",
      "type: daily",
      "---",
      "# A clear heading",
      "Read [good writing](https://example.com) and [[Bird by Bird|this book]].",
      "<!-- hidden comment words -->",
      "Inline `ignored code words` and https://example.com/path.",
      "![ignored image](image.png)",
      "- ordinary list words",
      "1. numbered list words",
      "```",
      "fenced code words",
      "```"
    ].join("\n"), "en-US")).toBe(11);
  });
});
