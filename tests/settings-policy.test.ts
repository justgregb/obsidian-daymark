import { describe, expect, it } from "vitest";
import {
  settingsAreEqual,
  settingsRequireAdditionalWordRebuild,
  settingsRequireRebuild
} from "../src/settings-policy";
import type { DaymarkSettings } from "../src/types";

const settings: DaymarkSettings = {
  journalFolder: "Journal",
  dateFormat: "YYYY-MM-DD",
  templatePath: "Shelf/Templates/Daily Note Template.md",
  additionalWordFolder: "",
  weekStart: "locale",
  highlightedWeekdays: [],
  showCoverPhotos: true,
  showSelectedDayStats: true,
  tallyEnabled: true
};

describe("settings refresh policy", () => {
  it("rebuilds only when the daily-note source changes", () => {
    expect(settingsRequireRebuild(settings, { ...settings, journalFolder: "Daily" })).toBe(true);
    expect(settingsRequireRebuild(settings, { ...settings, dateFormat: "YYYY/MM/DD" })).toBe(true);
    expect(settingsRequireRebuild(settings, { ...settings, templatePath: "Templates/Daily.md" })).toBe(false);
    expect(settingsRequireRebuild(settings, { ...settings, additionalWordFolder: "Desk/Longform" })).toBe(false);
    expect(settingsRequireAdditionalWordRebuild(settings, {
      ...settings,
      additionalWordFolder: "Desk/Longform"
    })).toBe(true);
    expect(settingsRequireRebuild(settings, { ...settings, weekStart: "monday" })).toBe(false);
    expect(settingsRequireRebuild(settings, { ...settings, highlightedWeekdays: [0, 6] })).toBe(false);
    expect(settingsRequireRebuild(settings, { ...settings, showCoverPhotos: false })).toBe(false);
    expect(settingsRequireRebuild(settings, { ...settings, showSelectedDayStats: false })).toBe(false);
    expect(settingsRequireRebuild(settings, { ...settings, tallyEnabled: false })).toBe(false);
  });

  it("recognizes no-op updates", () => {
    expect(settingsAreEqual(settings, { ...settings })).toBe(true);
    expect(settingsAreEqual(settings, { ...settings, templatePath: "Templates/Daily.md" })).toBe(false);
    expect(settingsAreEqual(settings, { ...settings, additionalWordFolder: "Desk/Longform" })).toBe(false);
    expect(settingsAreEqual(settings, { ...settings, weekStart: "sunday" })).toBe(false);
    expect(settingsAreEqual(settings, { ...settings, highlightedWeekdays: [0, 6] })).toBe(false);
    expect(settingsAreEqual(settings, { ...settings, showCoverPhotos: false })).toBe(false);
    expect(settingsAreEqual(settings, { ...settings, showSelectedDayStats: false })).toBe(false);
    expect(settingsAreEqual(settings, { ...settings, tallyEnabled: false })).toBe(false);
  });
});
