import { aggregateRecords } from "./aggregate";
import { dateIsWithin, toIsoDate } from "./date";
import type { DailyRecord, PeriodAggregate, PeriodBounds } from "./types";

const MAX_AGGREGATE_CACHE_ENTRIES = 64;

interface CachedAggregate {
  bounds: PeriodBounds;
  value: PeriodAggregate;
}

export class DaymarkStore {
  private readonly records = new Map<string, DailyRecord>();
  private readonly recordsByIsoDate = new Map<string, DailyRecord>();
  private readonly aggregateCache = new Map<string, CachedAggregate>();
  private readonly tagCounts = new Map<string, number>();
  private knownTagsCache: readonly string[] | null = null;

  replace(records: Iterable<DailyRecord>): void {
    this.records.clear();
    this.recordsByIsoDate.clear();
    this.aggregateCache.clear();
    this.tagCounts.clear();
    this.knownTagsCache = null;
    for (const record of records) this.setRecord(record);
  }

  upsert(record: DailyRecord): void {
    const previous = this.records.get(record.path);
    if (previous) this.invalidateAggregatesForDate(previous.date);
    this.invalidateAggregatesForDate(record.date);
    this.setRecord(record);
  }

  private setRecord(record: DailyRecord): void {
    const previous = this.records.get(record.path);
    const cachedTags = this.knownTagsCache;
    if (previous) {
      this.adjustTags(previous, -1);
      if (previous.isoDate !== record.isoDate) {
        this.records.delete(record.path);
        this.removeDateLookup(previous);
      }
    }
    this.records.set(record.path, record);
    this.recordsByIsoDate.set(record.isoDate, record);
    this.adjustTags(record, 1);
    if (cachedTags
      && cachedTags.length === this.tagCounts.size
      && cachedTags.every((tag) => this.tagCounts.has(tag))) this.knownTagsCache = cachedTags;
  }

  remove(path: string): void {
    const record = this.records.get(path);
    if (!record) return;
    this.invalidateAggregatesForDate(record.date);
    this.adjustTags(record, -1);
    this.records.delete(path);
    this.removeDateLookup(record);
  }

  has(path: string): boolean {
    return this.records.has(path);
  }

  aggregate(bounds: PeriodBounds): PeriodAggregate {
    const key = `${toIsoDate(bounds.start)}/${toIsoDate(bounds.end)}`;
    const cached = this.aggregateCache.get(key);
    if (cached) {
      this.aggregateCache.delete(key);
      this.aggregateCache.set(key, cached);
      return cached.value;
    }

    const value = aggregateRecords(this.records.values(), bounds);
    this.aggregateCache.set(key, { bounds, value });
    while (this.aggregateCache.size > MAX_AGGREGATE_CACHE_ENTRIES) {
      const oldest = this.aggregateCache.keys().next().value;
      if (oldest === undefined) break;
      this.aggregateCache.delete(oldest);
    }
    return value;
  }

  getByIsoDate(isoDate: string): DailyRecord | null {
    return this.recordsByIsoDate.get(isoDate) ?? null;
  }

  get size(): number {
    return this.records.size;
  }

  knownTags(): readonly string[] {
    if (!this.knownTagsCache) {
      this.knownTagsCache = [...this.tagCounts.keys()].sort((left, right) => left.localeCompare(right));
    }
    return this.knownTagsCache;
  }

  private adjustTags(record: DailyRecord, delta: 1 | -1): void {
    for (const task of record.taggedTasks) {
      const previous = this.tagCounts.get(task.tag) ?? 0;
      const next = previous + delta;
      if (next > 0) this.tagCounts.set(task.tag, next);
      else this.tagCounts.delete(task.tag);
      if ((previous === 0) !== (next === 0)) this.knownTagsCache = null;
    }
  }

  private removeDateLookup(record: DailyRecord): void {
    if (this.recordsByIsoDate.get(record.isoDate)?.path !== record.path) return;
    this.recordsByIsoDate.delete(record.isoDate);
    for (const candidate of this.records.values()) {
      if (candidate.isoDate === record.isoDate) {
        this.recordsByIsoDate.set(candidate.isoDate, candidate);
        break;
      }
    }
  }

  private invalidateAggregatesForDate(date: DailyRecord["date"]): void {
    for (const [key, cached] of this.aggregateCache) {
      if (dateIsWithin(date, cached.bounds)) this.aggregateCache.delete(key);
    }
  }
}
