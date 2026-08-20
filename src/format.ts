import type { TallyMetric } from "./types";

const TALLY_TAG_PATTERN = /^[\p{L}\p{N}_/-]+$/u;
const MAX_TALLY_LABEL_LENGTH = 80;
export const TALLY_METRICS: readonly TallyMetric[] = ["dailyNotes", "words", "photos"];
const DEFAULT_TALLY_METRIC_LABELS: Record<TallyMetric, string> = {
  dailyNotes: "Daily notes",
  words: "Words",
  photos: "Photos"
};

export function formatTagLabel(tag: string, locale?: string): string {
  const label = tag.replace(/[-_/]+/gu, " ").replace(/\s+/gu, " ").trim();
  const characters = Array.from(label);
  const first = characters.shift();
  if (!first) return tag;
  return `${first.toLocaleUpperCase(locale)}${characters.join("")}`;
}

export function canonicalTallyTag(tag: string): string {
  const canonical = tag.trim().replace(/^#+/u, "").toLocaleLowerCase();
  return TALLY_TAG_PATTERN.test(canonical) ? canonical : "";
}

export function normalizeTallyLabel(value: string): string {
  return Array.from(value.replace(/\s+/gu, " ").trim())
    .slice(0, MAX_TALLY_LABEL_LENGTH)
    .join("");
}

export function normalizeTallyTagLabels(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const labels: Record<string, string> = {};
  for (const [rawTag, rawLabel] of Object.entries(value)) {
    if (typeof rawLabel !== "string") continue;
    const tag = canonicalTallyTag(rawTag);
    const label = normalizeTallyLabel(rawLabel);
    if (tag.length > 0 && label.length > 0) labels[tag] = label;
  }
  return labels;
}

export function normalizeTallyMetricLabels(value: unknown): Partial<Record<TallyMetric, string>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const labels: Partial<Record<TallyMetric, string>> = {};
  for (const metric of TALLY_METRICS) {
    const rawLabel = source[metric];
    if (typeof rawLabel !== "string") continue;
    const label = normalizeTallyLabel(rawLabel);
    if (label.length > 0) labels[metric] = label;
  }
  return labels;
}

export function tallyTagLabelsAreEqual(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>
): boolean {
  const leftEntries = Object.entries(left).sort(([leftTag], [rightTag]) => leftTag.localeCompare(rightTag));
  const rightEntries = Object.entries(right).sort(([leftTag], [rightTag]) => leftTag.localeCompare(rightTag));
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([tag, label], index) => {
      const rightEntry = rightEntries[index];
      return rightEntry?.[0] === tag && rightEntry[1] === label;
    });
}

export function tallyMetricLabelsAreEqual(
  left: Readonly<Partial<Record<TallyMetric, string>>>,
  right: Readonly<Partial<Record<TallyMetric, string>>>
): boolean {
  return TALLY_METRICS.every((metric) => (left[metric] ?? "") === (right[metric] ?? ""));
}

export function serializeTallyTagLabels(labels: Readonly<Record<string, string>>): string {
  return JSON.stringify(Object.entries(labels).sort(([left], [right]) => left.localeCompare(right)));
}

export function serializeTallyMetricLabels(
  labels: Readonly<Partial<Record<TallyMetric, string>>>
): string {
  return JSON.stringify(TALLY_METRICS.map((metric) => [metric, labels[metric] ?? ""]));
}

export function resolveTallyMetricLabel(
  metric: TallyMetric,
  labels: Readonly<Partial<Record<TallyMetric, string>>>
): string {
  return normalizeTallyLabel(labels[metric] ?? "") || DEFAULT_TALLY_METRIC_LABELS[metric];
}

export function resolveTagLabel(
  tag: string,
  labels: Readonly<Record<string, string>>,
  locale?: string
): string {
  const canonical = canonicalTallyTag(tag);
  const configured = canonical.length > 0 ? normalizeTallyLabel(labels[canonical] ?? "") : "";
  return configured.length > 0 ? configured : formatTagLabel(tag, locale);
}

export function sortByResolvedTagLabel<T extends { tag: string }>(
  tags: readonly T[],
  labels: Readonly<Record<string, string>>,
  locale?: string
): T[] {
  return [...tags].sort((left, right) => {
    const labelOrder = resolveTagLabel(left.tag, labels, locale)
      .localeCompare(resolveTagLabel(right.tag, labels, locale), locale);
    return labelOrder || left.tag.localeCompare(right.tag, locale);
  });
}

export function escapeMarkdownLabel(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+.!|<>])/gu, "\\$1");
}
