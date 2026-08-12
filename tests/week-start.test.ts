import { describe, expect, it } from "vitest";
import {
  normalizeHighlightedWeekdays,
  normalizeWeekStartSetting,
  resolveWeekStartSetting
} from "../src/week-start";

describe("week preferences", () => {
  it("resolves locale and every explicit first weekday", () => {
    expect(resolveWeekStartSetting("locale", 0)).toBe(0);
    expect(resolveWeekStartSetting("locale", 9)).toBe(1);
    expect(resolveWeekStartSetting("sunday", 1)).toBe(0);
    expect(resolveWeekStartSetting("monday", 0)).toBe(1);
    expect(resolveWeekStartSetting("tuesday", 0)).toBe(2);
    expect(resolveWeekStartSetting("wednesday", 0)).toBe(3);
    expect(resolveWeekStartSetting("thursday", 0)).toBe(4);
    expect(resolveWeekStartSetting("friday", 0)).toBe(5);
    expect(resolveWeekStartSetting("saturday", 0)).toBe(6);
  });

  it("normalizes highlighted weekdays", () => {
    expect(normalizeHighlightedWeekdays([6, 0, 6, -1, 7, "1"])).toEqual([0, 6]);
    expect(normalizeHighlightedWeekdays(null)).toEqual([]);
  });

  it("falls back to locale for an invalid stored first weekday", () => {
    expect(normalizeWeekStartSetting("friday")).toBe("friday");
    expect(normalizeWeekStartSetting("noday")).toBe("locale");
  });
});
