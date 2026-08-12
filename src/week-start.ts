import type { WeekStartSetting, Weekday } from "./types";

export const EXPLICIT_WEEK_STARTS: ReadonlyArray<{
  value: Exclude<WeekStartSetting, "locale">;
  weekday: Weekday;
}> = [
  { value: "sunday", weekday: 0 },
  { value: "monday", weekday: 1 },
  { value: "tuesday", weekday: 2 },
  { value: "wednesday", weekday: 3 },
  { value: "thursday", weekday: 4 },
  { value: "friday", weekday: 5 },
  { value: "saturday", weekday: 6 }
];

export function resolveWeekStartSetting(setting: WeekStartSetting, localeDefault: number): Weekday {
  if (setting === "locale") return localeDefault >= 0 && localeDefault <= 6 ? localeDefault as Weekday : 1;
  return EXPLICIT_WEEK_STARTS.find((candidate) => candidate.value === setting)?.weekday ?? 1;
}

export function normalizeWeekStartSetting(value: unknown): WeekStartSetting {
  if (value === "locale") return value;
  return EXPLICIT_WEEK_STARTS.some((candidate) => candidate.value === value)
    ? value as WeekStartSetting
    : "locale";
}

export function normalizeHighlightedWeekdays(value: unknown): Weekday[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((weekday): weekday is Weekday => (
    typeof weekday === "number" && Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
  )))].sort((left, right) => left - right);
}
