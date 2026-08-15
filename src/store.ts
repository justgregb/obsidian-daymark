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

  replace(records: Iterable<DailyRecord>): void {
    this.records.clear();
    this.recordsByIsoDate.clear();
    this.aggregateCache.clear();
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
    if (previous && previous.isoDate !== record.isoDate) {
      this.records.delete(record.path);
      this.removeDateLookup(previous);
    }
    this.records.set(record.path, record);
    this.recordsByIsoDate.set(record.isoDate, record);
  }

  remove(path: string): void {
    const record = this.records.get(path);
    if (!record) return;
    this.invalidateAggregatesForDate(record.date);
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
