import { DEFAULT_SETTINGS, type DaymarkSettings } from "./types";
import { normalizeTallyMetricLabels, normalizeTallyTagLabels } from "./format";

export const CURRENT_SETTINGS_VERSION = 3;

type StoredSettings = Omit<Partial<DaymarkSettings>, "tallyMetricLabels" | "tallyTagLabels"> & {
  showSelectedDayStats?: unknown;
  settingsVersion?: unknown;
  tallyMetricLabels?: unknown;
  tallyTagLabels?: unknown;
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
  const metricLabels = normalizeTallyMetricLabels(stored.tallyMetricLabels);
  const originalMetricEntries = isRecord(stored.tallyMetricLabels)
    ? Object.entries(stored.tallyMetricLabels)
    : [];
  if (!isRecord(stored.tallyMetricLabels)
    || originalMetricEntries.length !== Object.keys(metricLabels).length
    || originalMetricEntries.some(([metric, label]) => metricLabels[metric as keyof typeof metricLabels] !== label)) {
    changed = true;
  }
  stored.tallyMetricLabels = metricLabels;
  const labels = normalizeTallyTagLabels(stored.tallyTagLabels);
  const originalEntries = isRecord(stored.tallyTagLabels) ? Object.entries(stored.tallyTagLabels) : [];
  if (!isRecord(stored.tallyTagLabels)
    || originalEntries.length !== Object.keys(labels).length
    || originalEntries.some(([tag, label]) => labels[tag] !== label)) changed = true;
  stored.tallyTagLabels = labels;
  if (stored.settingsVersion !== CURRENT_SETTINGS_VERSION) {
    stored.settingsVersion = CURRENT_SETTINGS_VERSION;
    changed = true;
  }

  return { settings: stored as Partial<DaymarkSettings>, changed };
}
