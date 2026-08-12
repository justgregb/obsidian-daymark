import { moment } from "obsidian";
import type { PlainDate } from "./types";

const FORMAT_SAMPLES = [
  { year: 2024, month: 2, day: 29 },
  { year: 2026, month: 8, day: 12 }
] as const;

function sampleMoment(date: PlainDate) {
  return moment([date.year, date.month - 1, date.day]);
}

export function parseObsidianDateFormat(value: string, format: string): PlainDate | null {
  const parsed = moment(value, format, true);
  if (!parsed.isValid()) return null;
  return { year: parsed.year(), month: parsed.month() + 1, day: parsed.date() };
}

export function previewObsidianDateFormat(format: string): string {
  return moment().format(format);
}

export function isValidObsidianDateFormat(format: string): boolean {
  if (format.trim().length === 0) return false;
  for (const sample of FORMAT_SAMPLES) {
    const rendered = sampleMoment(sample).format(format);
    if (/^(?:\/|.*\/$)|\/{2,}|[\\:*?"<>|]/u.test(rendered)) return false;
    const parsed = parseObsidianDateFormat(rendered, format);
    if (!parsed || parsed.year !== sample.year || parsed.month !== sample.month || parsed.day !== sample.day) {
      return false;
    }
  }
  return true;
}
