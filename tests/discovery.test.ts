import { describe, expect, it } from "vitest";
import moment from "moment";
import { dateFromDailyNotePath, pathIsWithinFolder } from "../src/discovery";

function parseMomentDate(value: string, format: string) {
  const parsed = moment(value, format, true);
  return parsed.isValid()
    ? { year: parsed.year(), month: parsed.month() + 1, day: parsed.date() }
    : null;
}

describe("daily-note discovery", () => {
  it("includes direct and nested Markdown notes beneath the configured folder", () => {
    expect(pathIsWithinFolder("Journal/2026-08-12.md", "Journal")).toBe(true);
    expect(pathIsWithinFolder("Journal/2026/08/2026-08-12.md", "Journal/")).toBe(true);
    expect(dateFromDailyNotePath("Journal/2026/08/2026-08-12.md", "Journal", "YYYY-MM-DD"))
      .toEqual({ year: 2026, month: 8, day: 12 });
  });

  it("uses a Daily Notes-style format for nested date paths", () => {
    expect(dateFromDailyNotePath(
      "Journal/2026/08/2026-08-12.md",
      "Journal",
      "YYYY/MM/YYYY-MM-DD",
      parseMomentDate
    )).toEqual({ year: 2026, month: 8, day: 12 });
  });

  it("excludes siblings, non-Markdown files, and invalid filenames", () => {
    expect(pathIsWithinFolder("Journal Archive/2026-08-12.md", "Journal")).toBe(false);
    expect(dateFromDailyNotePath("Desk/2026-08-12.md", "Journal", "YYYY-MM-DD")).toBeNull();
    expect(dateFromDailyNotePath("Journal/2026-08-12.txt", "Journal", "YYYY-MM-DD")).toBeNull();
    expect(dateFromDailyNotePath("Journal/notes.md", "Journal", "YYYY-MM-DD")).toBeNull();
    expect(dateFromDailyNotePath("Journal/2026/08/Tally — 2026-08.md", "Journal", "YYYY-MM-DD")).toBeNull();
  });
});
