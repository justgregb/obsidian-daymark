import { DEFAULT_SETTINGS, type DaymarkSettings } from "./types";

export const CURRENT_SETTINGS_VERSION = 1;

type StoredSettings = Partial<DaymarkSettings> & {
  showSelectedDayStats?: unknown;
  settingsVersion?: unknown;
};

export interface SettingsMigrationResult {
  settings: Partial<DaymarkSettings>;
  changed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function migrateStoredSettings(value: unknown): SettingsMigrationResult {
  const stored: StoredSettings = isRecord(value) ? { ...value } : {};
  let changed = !isRecord(value);

  if (typeof stored.showCalendarTotals !== "boolean" && typeof stored.showSelectedDayStats === "boolean") {
    stored.showCalendarTotals = stored.showSelectedDayStats;
    changed = true;
  }
  if (typeof stored.showCalendarTotals !== "boolean") {
    stored.showCalendarTotals = DEFAULT_SETTINGS.showCalendarTotals;
    changed = true;
  }
  if ("showSelectedDayStats" in stored) {
    delete stored.showSelectedDayStats;
    changed = true;
  }
  if (stored.settingsVersion !== CURRENT_SETTINGS_VERSION) {
    stored.settingsVersion = CURRENT_SETTINGS_VERSION;
    changed = true;
  }

  return { settings: stored, changed };
}
