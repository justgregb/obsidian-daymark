import { describe, expect, it } from "vitest";
import {
  settingsAreEqual,
  settingsRequireAdditionalWordRebuild,
  settingsRequireRebuild
} from "../src/settings-policy";
import type { DaymarkSettings } from "../src/types";

const settings: DaymarkSettings = {
  settingsVersion: 3,
  journalFolder: "Journal",
  dateFormat: "YYYY-MM-DD",
  templatePath: "Shelf/Templates/Daily Note Template.md",
  additionalWordFolder: "",
  weekStart: "locale",
  highlightedWeekdays: [],
  showCoverPhotos: true,
  showCalendarTotals: true,
  tallyEnabled: true,
  tallyMetricLabels: {},
  tallyTagLabels: {}
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
    expect(settingsRequireRebuild(settings, { ...settings, showCalendarTotals: false })).toBe(false);
    expect(settingsRequireRebuild(settings, { ...settings, tallyEnabled: false })).toBe(false);
    expect(settingsRequireRebuild(settings, {
      ...settings,
      tallyTagLabels: { running: "Kilometres run" }
    })).toBe(false);
    expect(settingsRequireRebuild(settings, {
      ...settings,
      tallyMetricLabels: { photos: "Images" }
    })).toBe(false);
    expect(settingsRequireAdditionalWordRebuild(settings, {
      ...settings,
      tallyTagLabels: { running: "Kilometres run" }
    })).toBe(false);
    expect(settingsRequireAdditionalWordRebuild(
      { ...settings, tallyEnabled: false, additionalWordFolder: "Desk/Longform" },
      { ...settings, tallyEnabled: true, additionalWordFolder: "Desk/Longform" }
    )).toBe(true);
    expect(settingsRequireAdditionalWordRebuild(
      { ...settings, tallyEnabled: false },
      { ...settings, tallyEnabled: false, additionalWordFolder: "Desk/Longform" }
    )).toBe(false);
  });

  it("recognizes no-op updates", () => {
    expect(settingsAreEqual(settings, { ...settings })).toBe(true);
    expect(settingsAreEqual(settings, { ...settings, templatePath: "Templates/Daily.md" })).toBe(false);
    expect(settingsAreEqual(settings, { ...settings, additionalWordFolder: "Desk/Longform" })).toBe(false);
    expect(settingsAreEqual(settings, { ...settings, weekStart: "sunday" })).toBe(false);
    expect(settingsAreEqual(settings, { ...settings, highlightedWeekdays: [0, 6] })).toBe(false);
    expect(settingsAreEqual(settings, { ...settings, showCoverPhotos: false })).toBe(false);
    expect(settingsAreEqual(settings, { ...settings, showCalendarTotals: false })).toBe(false);
    expect(settingsAreEqual(settings, { ...settings, tallyEnabled: false })).toBe(false);
    expect(settingsAreEqual(settings, {
      ...settings,
      tallyTagLabels: { running: "Kilometres run" }
    })).toBe(false);
    expect(settingsAreEqual(settings, {
      ...settings,
      tallyMetricLabels: { photos: "Images" }
    })).toBe(false);
    expect(settingsAreEqual(
      { ...settings, tallyTagLabels: { running: "Run", pushups: "Push-ups" } },
      { ...settings, tallyTagLabels: { pushups: "Push-ups", running: "Run" } }
    )).toBe(true);
  });
});
