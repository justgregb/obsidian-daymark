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
    expect(record.totalCheckboxes).toBe(0);
    expect(record.completedCheckboxes).toBe(0);
    expect(record.taggedValues).toEqual([{ tag: "pushups", value: 160 }]);
  });

  it("handles nested tasks, X status, decimals, multiple tags, and duplicate tags", () => {
    const record = parseDailyNote(
      "Journal/2026-08-12.md",
      "2026-08-12",
      date,
      [
        "  - [X] 5.5 #Running #cardio #running",
        "- [x] Greek #greek",
        "- [ ] 20 #pushups",
        "- [x] Finished ordinary item",
        "- [ ] Pending ordinary item"
      ].join("\n")
    );
    expect(record.completedCheckboxes).toBe(1);
    expect(record.totalCheckboxes).toBe(2);
    expect(record.taggedValues).toEqual([
      { tag: "running", value: 5.5 },
      { tag: "cardio", value: 5.5 },
      { tag: "greek", value: 1 }
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
    expect(record.taggedValues).toEqual([
      { tag: "test", value: 60 },
      { tag: "running", value: 5.5 }
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
    expect(record.completedCheckboxes).toBe(1);
    expect(record.totalCheckboxes).toBe(1);
    expect(record.taggedValues).toEqual([{ tag: "meditation", value: 0 }]);
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
    expect(record.taggedValues).toEqual([]);
  });
});

describe("journal photos", () => {
  it("counts local photo embeds while ignoring remote images, comments, and code", () => {
    const content = [
      "![[cover.jpg|300]]",
      "![Detail](Assets/detail.png)",
      "![Spaced](<Assets/my photo.webp>)",
      "![Remote](https://example.com/photo.jpg)",
      "![[document.pdf]]",
      "`![[inline-code.jpg]]`",
      "<!-- ![[hidden.jpg]] -->",
      "```markdown",
      "![[fenced.jpg]]",
      "```"
    ].join("\n");
    const record = parseDailyNote("Journal/2026-08-12.md", "2026-08-12", date, content);
    expect(record.photos).toBe(3);
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
