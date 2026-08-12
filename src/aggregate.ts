import { dateIsWithin } from "./date";
import type {
  AggregateTaskSource,
  DailyMetricSource,
  DailyRecord,
  PeriodAggregate,
  PeriodBounds,
  TagAggregate
} from "./types";

export function aggregateRecords(records: Iterable<DailyRecord>, bounds: PeriodBounds): PeriodAggregate {
  const selected = [...records]
    .filter((record) => dateIsWithin(record.date, bounds))
    .sort((left, right) => left.isoDate.localeCompare(right.isoDate));

  const wordSources: DailyMetricSource[] = [];
  const checkboxSources: DailyMetricSource[] = [];
  const noteSources: DailyMetricSource[] = [];
  const tags = new Map<string, TagAggregate>();
  let words = 0;
  let totalCheckboxes = 0;
  let completedCheckboxes = 0;

  for (const record of selected) {
    noteSources.push({ date: record.date, isoDate: record.isoDate, path: record.path, value: 1 });
    words += record.words;
    totalCheckboxes += record.totalCheckboxes;
    completedCheckboxes += record.completedCheckboxes;
    if (record.words > 0) {
      wordSources.push({ date: record.date, isoDate: record.isoDate, path: record.path, value: record.words });
    }
    if (record.completedCheckboxes > 0) {
      checkboxSources.push({
        date: record.date,
        isoDate: record.isoDate,
        path: record.path,
        value: record.completedCheckboxes
      });
    }

    for (const source of record.taggedTasks) {
      const aggregate = tags.get(source.tag) ?? { tag: source.tag, total: 0, sources: [] };
      const enriched: AggregateTaskSource = {
        ...source,
        date: record.date,
        isoDate: record.isoDate,
        path: record.path
      };
      aggregate.total += source.value;
      aggregate.sources.push(enriched);
      tags.set(source.tag, aggregate);
    }
  }

  return {
    bounds,
    noteCount: selected.length,
    notePaths: selected.map((record) => record.path),
    noteSources,
    words,
    totalCheckboxes,
    completedCheckboxes,
    wordSources,
    checkboxSources,
    tags: [...tags.values()].sort((left, right) => left.tag.localeCompare(right.tag))
  };
}
