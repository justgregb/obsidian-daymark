import type { PeriodMode } from "./types";

export function nextCalendarMode(mode: PeriodMode): PeriodMode {
  if (mode === "week") return "month";
  if (mode === "month") return "year";
  return "week";
}
