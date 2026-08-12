import { describe, expect, it } from "vitest";
import { dailyNotePath, renderDailyNoteTemplate } from "../src/daily-note";

describe("daily-note creation", () => {
  it("uses the configured nested date format", () => {
    expect(dailyNotePath("Journal", "YYYY/MM/YYYY-MM-DD", { year: 2026, month: 8, day: 12 }))
      .toBe("Journal/2026/08/2026-08-12.md");
  });

  it("expands local template variables for the selected date", () => {
    const content = renderDailyNoteTemplate(
      "# {{title}}\n{{date}}\n{{date:dddd}}\n{{time:HH:mm}}\n",
      { year: 2026, month: 8, day: 12 },
      "YYYY/MM/YYYY-MM-DD",
      new Date(2026, 7, 12, 9, 30)
    );
    expect(content).toBe("# 2026-08-12\n2026-08-12\nWednesday\n09:30\n");
  });
});
