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
    const result = migrateStoredSettings({ settingsVersion: CURRENT_SETTINGS_VERSION, showCalendarTotals: true });
    expect(result.changed).toBe(false);
  });

  it("recovers safely from missing plugin data", () => {
    const result = migrateStoredSettings(null);
    expect(result.settings.showCalendarTotals).toBe(true);
    expect(result.settings.settingsVersion).toBe(CURRENT_SETTINGS_VERSION);
  });
});
