import { describe, expect, it } from "vitest";
import { getPeriodBounds } from "../src/date";
import { buildBreakdownRows, type BreakdownSource } from "../src/drilldown";

function source(isoDate: string, value: number, line?: number): BreakdownSource {
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  return {
    date: { year, month, day },
    isoDate,
    path: `Journal/${year}/${String(month).padStart(2, "0")}/${isoDate}.md`,
    value,
    line
  };
}

describe("period drill-down", () => {
  it("groups a year into months", () => {
    const bounds = getPeriodBounds({ year: 2026, month: 8, day: 12 }, "year", 1);
    const rows = buildBreakdownRows([
      source("2026-01-02", 10),
      source("2026-01-20", 20),
      source("2026-02-01", 40)
    ], "year", bounds, 1, "en-US");
    expect(rows.map(({ label, value }) => ({ label, value }))).toEqual([
      { label: "Jan", value: 30 },
      { label: "Feb", value: 40 }
    ]);
    expect(rows.every((row) => row.path === null)).toBe(true);
  });

  it("groups a month into calendar weeks and clips boundary labels", () => {
    const bounds = getPeriodBounds({ year: 2026, month: 8, day: 12 }, "month", 1);
    const rows = buildBreakdownRows([
      source("2026-08-01", 10),
      source("2026-08-02", 20),
      source("2026-08-03", 40)
    ], "month", bounds, 1, "en-US");
    expect(rows.map(({ label, value }) => ({ label, value }))).toEqual([
      { label: "Aug 1–2", value: 30 },
      { label: "Aug 3–9", value: 40 }
    ]);
  });

  it("groups a week into days and retains daily-note navigation", () => {
    const bounds = getPeriodBounds({ year: 2026, month: 8, day: 12 }, "week", 1);
    const rows = buildBreakdownRows([
      source("2026-08-10", 10, 3),
      source("2026-08-12", 20, 5),
      source("2026-08-12", 30, 8)
    ], "week", bounds, 1, "en-US");
    expect(rows.map(({ label, value }) => ({ label, value }))).toEqual([
      { label: "Mon, Aug 10", value: 10 },
      { label: "Wed, Aug 12", value: 50 }
    ]);
    expect(rows[1]?.path).toContain("2026-08-12.md");
    expect(rows[1]?.line).toBe(5);
  });
});
