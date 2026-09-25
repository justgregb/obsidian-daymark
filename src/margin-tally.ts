import { canonicalTallyTag, resolveTagLabel, resolveTallyMetricLabel, sortByResolvedTagLabel } from "./format";
import type { DailyMetricSource, DaymarkSettings, PeriodAggregate } from "./types";

export interface MarginTallyLens {
  id: string;
  label: string;
  total: number;
  values: ReadonlyMap<string, number>;
  maximum: number;
}

export function normalizeMarginLens(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (["dailyNotes", "words", "photos", "checkedItems"].includes(value)) return value;
  if (!value.startsWith("tag:")) return null;
  const tag = canonicalTallyTag(value.slice(4));
  return tag ? `tag:${tag}` : null;
}

/** Use the same period sources as Tally, including duplicate-date notes and recorded zeroes. */
export function marginTallyLenses(
  aggregate: PeriodAggregate, settings: DaymarkSettings, locale: string, onlyId?: string
): MarginTallyLens[] {
  if (!aggregate.noteCount) return [];
  const lens = (id: string, label: string, total: number, sources: readonly DailyMetricSource[], zeroes = false): MarginTallyLens | null => {
    if (onlyId && id !== onlyId) return null;
    const values = new Map<string, number>();
    if (zeroes) for (const source of aggregate.noteSources) values.set(source.isoDate, 0);
    for (const source of sources) values.set(source.isoDate, (values.get(source.isoDate) ?? 0) + source.value);
    return { id, label, total, values, maximum: Math.max(0, ...values.values()) };
  };
  const label = (key: "dailyNotes" | "words" | "photos") => resolveTallyMetricLabel(key, settings.tallyMetricLabels);
  const result = [
    lens("dailyNotes", label("dailyNotes"), aggregate.noteCount, aggregate.noteSources),
    lens("words", label("words"), aggregate.words, aggregate.wordSources, true),
    lens("photos", label("photos"), aggregate.photos, aggregate.photoSources, true)
  ];
  if (aggregate.totalCheckboxes > 0) result.push(lens("checkedItems", "Checked items", aggregate.completedCheckboxes, aggregate.checkboxSources, true));
  const tags = onlyId ? aggregate.tags.filter(tag => `tag:${tag.tag}` === onlyId)
    : sortByResolvedTagLabel(aggregate.tags, settings.tallyTagLabels, locale);
  for (const tag of tags) {
    result.push(lens(`tag:${tag.tag}`, resolveTagLabel(tag.tag, settings.tallyTagLabels, locale), tag.total, tag.sources));
  }
  return result.filter((item): item is MarginTallyLens => item !== null);
}

/** Keep the chosen metric when browsing a month with no matches. */
export function resolveMarginLens(
  id: string | null, lenses: readonly MarginTallyLens[], settings: DaymarkSettings, locale: string
): MarginTallyLens | null {
  if (!id) return null;
  const found = lenses.find(lens => lens.id === id);
  if (found) return found;
  const label = id.startsWith("tag:") ? resolveTagLabel(id.slice(4), settings.tallyTagLabels, locale)
    : id === "checkedItems" ? "Checked items"
    : resolveTallyMetricLabel(id as "dailyNotes" | "words" | "photos", settings.tallyMetricLabels);
  return { id, label, total: 0, values: new Map(), maximum: 0 };
}
