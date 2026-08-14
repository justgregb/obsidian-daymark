import { parseIsoDate, todayPlainDate, toIsoDate } from "./date";
import type { PeriodMode, PlainDate } from "./types";

export interface LegacyTallyState {
  mode?: unknown;
  anchorDate?: unknown;
}

export interface UnifiedDaymarkState extends Record<string, unknown> {
  mode: PeriodMode;
  month: string;
  week: string;
  selectedDate: string;
  tallyExpanded: true;
}

export function legacyTallyToDaymarkState(
  state: LegacyTallyState,
  fallback: PlainDate = todayPlainDate()
): UnifiedDaymarkState {
  const mode = state.mode === "month" || state.mode === "year" || state.mode === "week"
    ? state.mode
    : "week";
  const anchor = typeof state.anchorDate === "string" ? parseIsoDate(state.anchorDate) ?? fallback : fallback;
  const isoDate = toIsoDate(anchor);
  return {
    mode,
    month: isoDate,
    week: isoDate,
    selectedDate: isoDate,
    tallyExpanded: true
  };
}
