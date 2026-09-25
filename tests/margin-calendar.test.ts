import { describe, expect, it } from "vitest";
import { calendarPeriodMode, marginWireStyle, marginWritingCoil, marginWritingWords } from "../src/margin-calendar";
import { moveCalendarViewport } from "../src/calendar-state";
import { type DailyRecord } from "../src/types";

const record: DailyRecord = {
  path: "Journal/2026/09/2026-09-12.md",
  basename: "2026-09-12",
  date: { year: 2026, month: 9, day: 12 },
  isoDate: "2026-09-12",
  words: 80,
  photos: 2,
  totalCheckboxes: 2,
  completedCheckboxes: 2,
  taggedValues: [{ tag: "swimming", value: 0 }, { tag: "pushups", value: 30 }]
};
describe("margin calendar", () => {
  it("keeps the selected day when navigating through the year boundary", () => {
    const state = {
      displayedMonth: { year: 2026, month: 12, day: 1 },
      displayedWeek: record.date,
      selectedDate: record.date
    };
    const next = moveCalendarViewport(state, "month", 1);
    expect(next.displayedMonth).toEqual({ year: 2027, month: 1, day: 1 });
    expect(next.selectedDate).toEqual(record.date);
    expect(moveCalendarViewport(next, "month", -1).displayedMonth).toEqual(state.displayedMonth);
  });

  it("uses monthly bounds in Margin while retaining Standard period choices", () => {
    for (const mode of ["week", "month", "year"] as const) {
      expect(calendarPeriodMode(mode, "margin")).toBe("month");
      expect(calendarPeriodMode(mode, "standard")).toBe(mode);
    }
  });

});

describe("margin writing", () => {
  // Sample the rendered curves to test visual geometry, rather than SVG commands.
  const coordinates = (path: string): number[][] => {
    const points: number[][] = [];
    for (const [, command, values] of path.matchAll(/([MLC])([^MLC]+)/g)) {
      const n = values.trim().split(/\s+/).map(Number);
      if (command !== "C") { points.push(n); continue; }
      const [x0, y0] = points[points.length - 1];
      for (let step = 1; step <= 32; step++) {
        const t = step / 32, u = 1 - t;
        points.push([
          u ** 3 * x0 + 3 * u ** 2 * t * n[0] + 3 * u * t ** 2 * n[2] + t ** 3 * n[4],
          u ** 3 * y0 + 3 * u ** 2 * t * n[1] + 3 * u * t ** 2 * n[3] + t ** 3 * n[5]
        ]);
      }
    }
    return points;
  };
  const styles = Array.from({ length: 64 }, (_, i) => marginWireStyle(`2026-09-${i}`, 1234));
  const turnCount = (words: number, style = 0) => {
    const points = coordinates(marginWritingCoil(words, style).path);
    const descending = points.map(([, y], index) => index > 0 && y < points[index - 1][1] - .00001);
    return descending.filter((value, index) => value && !descending[index - 1]).length;
  };

  it.each([120, 200, 320, 480, 700].flatMap(words => [0, 1, 2].map(style => ({ words, style }))))("keeps the $words-word coil in style $style centered with smooth joins outside its loops", ({ words, style }) => {
    const coil = marginWritingCoil(words, style);
    const points = coordinates(coil.path);
    const connectors = coordinates(coil.connectors);
    expect(connectors[0]).toEqual([8, 0]);
    expect(connectors.at(-1)).toEqual([8, 44]);
    expect(connectors[1]).toEqual(points[0]);
    expect(connectors[2]).toEqual(points.at(-1));
    expect(points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 3 && x <= 13 && y > 0 && y < 44)).toBe(true);
    const top = Math.min(...points.map(([, y]) => y));
    const bottom = Math.max(...points.map(([, y]) => y));
    expect((top + bottom) / 2).toBeCloseTo(22, 2);
    expect(bottom - top).toBeLessThanOrEqual(34.5);
    // Neither connector may run back into the loop (the former hook-shaped mark).
    expect(points[0][1]).toBe(top);
    expect(points.at(-1)![1]).toBe(bottom);
    const entry = points[1], exit = points.at(-2)!;
    expect(Math.abs(entry[0] - 8) / (entry[1] - top)).toBeLessThan(0.17);
    expect(Math.abs(exit[0] - 8) / (bottom - exit[1])).toBeLessThan(0.17);
    // Complete oval turns fold back vertically.
    expect(points.some(([, y], index) => index > 0 && y < points[index - 1][1])).toBe(true);
  });

  it("reuses writing levels and bounds retained shapes to 256", () => {
    const first = marginWritingCoil(320, 100000);
    for (let style = 100001; style < 100256; style++) marginWritingCoil(320, style);
    expect(marginWritingCoil(320, 100000)).toBe(first);
    const newest = marginWritingCoil(320, 100256);
    const regenerated = marginWritingCoil(320, 100000);
    expect(regenerated).not.toBe(first);
    expect(regenerated).toEqual(first);
    expect(marginWritingCoil(320, 100256)).toBe(newest);
    expect(marginWritingCoil(100000)).toBe(marginWritingCoil(700));
    for (const words of [-100, NaN, Infinity]) expect(marginWritingCoil(words)).toBe(marginWritingCoil(0));
    for (const style of styles) expect(marginWritingCoil(0, style)).toBe(marginWritingCoil(0));
  });

  it.each([[-20, 0], [0, 0], [1, 0], [29, 0], [60, 0], [120, 1], [199, 1], [200, 2], [319, 2], [320, 3], [479, 3], [480, 4], [699, 4], [700, 5], [50000, 5], [NaN, 0], [Infinity, 0]])(
    "maps %s daily-plus-linked words to %s coil turns", (words, turns) => {
      expect(turnCount(words)).toBe(turns);
    }
  );

  it("keeps short notes straight or gently bowed without forming loops", () => {
    for (const style of styles) {
      for (let words = 0; words <= 60; words += 10) {
        const points = coordinates(marginWritingCoil(words, style).path);
        expect(points.every(([x, y], index) => Math.abs(x - 8) <= 1.25 && (!index || y > points[index - 1][1]))).toBe(true);
        if (words < 30) expect(points.every(([x]) => x === 8)).toBe(true);
      }
    }
  });

  it("progressively opens the first turn instead of switching directly from a line to a loop", () => {
    const widths = Array.from({ length: 13 }, (_, index) => {
      const x = coordinates(marginWritingCoil(index * 10).path).map(([x]) => x);
      return Math.max(...x) - Math.min(...x);
    });
    expect(widths.every((width, index) => !index || width >= widths[index - 1])).toBe(true);
    expect(Math.max(...widths.slice(1).map((width, index) => width - widths[index]))).toBeLessThan(2);
    expect(widths[12]).toBeGreaterThan(5);
    expect(widths[12]).toBeLessThan(10);
  });

  it("varies every sampled date and view seed without shuffling on redraw", () => {
    const dates = Array.from({ length: 365 }, (_, index) => `day-${index}`);
    const assignments = (seed: number) => dates.map(iso => marginWireStyle(iso, seed));
    expect(assignments(1234)).toEqual(assignments(1234));
    expect(assignments(1234)).not.toEqual(assignments(5678));
    expect(new Set(assignments(1234)).size).toBe(365);
    for (const words of [60, 120, 320, 700]) {
      expect(new Set(assignments(1234).map(style => marginWritingCoil(words, style).path)).size).toBe(365);
    }
  });

  it("keeps varied turns connected, within the gutter, and faithful to writing volume", () => {
    for (const style of styles) {
      for (const [words, turns] of [[120, 1], [200, 2], [320, 3], [480, 4], [700, 5]]) {
        const coil = marginWritingCoil(words, style);
        const points = coordinates(coil.path);
        const connectors = coordinates(coil.connectors);
        expect(turnCount(words, style)).toBe(turns);
        expect(points.every(([x, y]) => x >= 3 && x <= 13 && y > 0 && y < 44)).toBe(true);
        expect(points[0]).toEqual(connectors[1]);
        expect(points.at(-1)).toEqual(connectors[2]);
        expect(points[0][1]).toBe(Math.min(...points.map(([, y]) => y)));
        expect(points.at(-1)![1]).toBe(Math.max(...points.map(([, y]) => y)));
        // Compact Béziers keep the expanded variety cheap to retain and paint.
        expect(coil.path.length).toBeLessThan(650);
      }
    }
  });

  it("varies direction, width, and spacing rather than translating identical loops", () => {
    const shapes = styles.map(style => coordinates(marginWritingCoil(700, style).path));
    expect(shapes.some(points => points[1][0] < 8)).toBe(true);
    expect(shapes.some(points => points[1][0] > 8)).toBe(true);
    const widths = shapes.map(points => Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x)));
    const heights = shapes.map(points => points.at(-1)![1] - points[0][1]);
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThan(1.5);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(3);
    // Individual turns differ even within a single date's wire.
    for (const points of shapes) {
      const ends = [1, 3, 5, 7, 9, 11].map(segment => points[segment * 32]);
      expect(new Set(ends.map(([x]) => x)).size).toBeGreaterThan(3);
      expect(new Set(ends.slice(1).map(([, y], index) => +(y - ends[index][1]).toFixed(2))).size).toBeGreaterThan(2);
    }
  });

  it("includes direct linked writing without changing the daily note word count", () => {
    const note = { ...record, linkedWords: 450, linkedNoteCount: 2 };
    expect(marginWritingWords(note)).toBe(530);
    expect(note.words).toBe(80);
    expect(marginWritingWords(null)).toBe(0);
  });

});
