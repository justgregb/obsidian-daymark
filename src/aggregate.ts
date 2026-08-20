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
  const selected: DailyRecord[] = [];
  for (const record of records) {
    if (dateIsWithin(record.date, bounds)) selected.push(record);
  }
  selected.sort((left, right) => left.isoDate.localeCompare(right.isoDate));

  const notePaths: string[] = [];
  const wordSources: DailyMetricSource[] = [];
  const photoSources: DailyMetricSource[] = [];
  const checkboxSources: DailyMetricSource[] = [];
  const noteSources: DailyMetricSource[] = [];
  const tags = new Map<string, TagAggregate>();
  let words = 0;
  let photos = 0;
  let totalCheckboxes = 0;
  let completedCheckboxes = 0;

  for (const record of selected) {
    notePaths.push(record.path);
    noteSources.push({ date: record.date, isoDate: record.isoDate, path: record.path, value: 1 });
    words += record.words;
    photos += record.photos;
    totalCheckboxes += record.totalCheckboxes;
    completedCheckboxes += record.completedCheckboxes;
    if (record.words > 0) {
      wordSources.push({ date: record.date, isoDate: record.isoDate, path: record.path, value: record.words });
    }
    if (record.photos > 0) {
      photoSources.push({ date: record.date, isoDate: record.isoDate, path: record.path, value: record.photos });
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
      let aggregate = tags.get(source.tag);
      if (!aggregate) {
        aggregate = { tag: source.tag, total: 0, sources: [] };
        tags.set(source.tag, aggregate);
      }
      const enriched: AggregateTaskSource = {
        ...source,
        date: record.date,
        isoDate: record.isoDate,
        path: record.path
      };
      aggregate.total += source.value;
      aggregate.sources.push(enriched);
    }
  }

  return {
    bounds,
    noteCount: selected.length,
    notePaths,
    noteSources,
    words,
    photos,
    totalCheckboxes,
    completedCheckboxes,
    wordSources,
    photoSources,
    checkboxSources,
    tags: [...tags.values()].sort((left, right) => left.tag.localeCompare(right.tag))
  };
}
