import { describe, expect, it } from "vitest";
import { CURRENT_SETTINGS_VERSION, migrateStoredSettings } from "../src/settings-migration";

describe("settings migration", () => {
  it("renames the legacy calendar totals key without changing its value", () => {
    const result = migrateStoredSettings({ showSelectedDayStats: false, journalFolder: "Journal" });
    expect(result.settings.showCalendarTotals).toBe(false);
    expect(result.settings).not.toHaveProperty("showSelectedDayStats");
    expect(result.settings.settingsVersion).toBe(CURRENT_SETTINGS_VERSION);
    expect(result.changed).toBe(true);
  });

  it("leaves the current schema stable", () => {
    const result = migrateStoredSettings({
      settingsVersion: CURRENT_SETTINGS_VERSION,
      showCalendarTotals: true,
      tallyMetricLabels: { photos: "Images" },
      tallyTagLabels: { running: "Kilometres run" }
    });
    expect(result.changed).toBe(false);
  });

  it("recovers safely from missing plugin data", () => {
    const result = migrateStoredSettings(null);
    expect(result.settings.showCalendarTotals).toBe(true);
    expect(result.settings.settingsVersion).toBe(CURRENT_SETTINGS_VERSION);
    expect(result.settings.tallyMetricLabels).toEqual({});
    expect(result.settings.tallyTagLabels).toEqual({});
  });

  it("migrates version 1 without losing preferences", () => {
    const result = migrateStoredSettings({
      settingsVersion: 1,
      journalFolder: "Diary",
      dateFormat: "DD.MM.YYYY",
      tallyEnabled: false
    });
    expect(result.settings).toMatchObject({
      settingsVersion: 3,
      journalFolder: "Diary",
      dateFormat: "DD.MM.YYYY",
      tallyEnabled: false,
      tallyTagLabels: {}
    });
    expect(result.changed).toBe(true);
  });

  it("normalizes aliases and recovers from invalid stored values", () => {
    const result = migrateStoredSettings({
      settingsVersion: 3,
      showCalendarTotals: true,
      tallyTagLabels: {
        "#Running": "  Kilometres   run ",
        pushups: "",
        cycling: 12
      }
    });
    expect(result.settings.tallyTagLabels).toEqual({ running: "Kilometres run" });
    expect(result.changed).toBe(true);
  });

  it("normalizes core metric aliases and drops unknown keys", () => {
    const result = migrateStoredSettings({
      settingsVersion: 3,
      showCalendarTotals: true,
      tallyMetricLabels: {
        dailyNotes: "  Journal   days ",
        words: "",
        photos: "Images",
        checkedItems: "Done"
      },
      tallyTagLabels: {}
    });
    expect(result.settings.tallyMetricLabels).toEqual({
      dailyNotes: "Journal days",
      photos: "Images"
    });
    expect(result.changed).toBe(true);
  });
});
