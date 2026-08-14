import { toDate } from "./date";
import { numberFormatter } from "./intl-cache";
import type { PeriodAggregate, PeriodBounds } from "./types";

export function periodDayCount(bounds: PeriodBounds): number {
  const milliseconds = toDate(bounds.end).getTime() - toDate(bounds.start).getTime();
  return Math.max(0, Math.round(milliseconds / 86_400_000));
}

export interface CalendarFooterSummary {
  full: string;
  compact: string;
}

export function formatCalendarFooterSummary(
  aggregate: PeriodAggregate,
  locale?: string
): CalendarFooterSummary {
  if (aggregate.noteCount === 0) return { full: "No daily notes", compact: "No daily notes" };
  const number = numberFormatter(locale, { maximumFractionDigits: 0 });
  const days = periodDayCount(aggregate.bounds);
  const coverage = `${number.format(aggregate.noteCount)}/${number.format(days)}`;
  const words = `${number.format(aggregate.words)} ${aggregate.words === 1 ? "word" : "words"}`;
  const checked = aggregate.totalCheckboxes > 0
    ? `${number.format(aggregate.completedCheckboxes)}/${number.format(aggregate.totalCheckboxes)}`
    : null;
  return {
    full: [
      `${coverage} days`,
      words,
      checked ? `${checked} checked` : null
    ].filter((item): item is string => item !== null).join(" · "),
    compact: [coverage, words, checked].filter((item): item is string => item !== null).join(" · ")
  };
}
