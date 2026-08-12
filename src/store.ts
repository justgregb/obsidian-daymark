import { aggregateRecords } from "./aggregate";
import type { DailyRecord, PeriodAggregate, PeriodBounds } from "./types";

export class DaymarkStore {
  private readonly records = new Map<string, DailyRecord>();

  replace(records: Iterable<DailyRecord>): void {
    this.records.clear();
    for (const record of records) this.records.set(record.path, record);
  }

  upsert(record: DailyRecord): void {
    this.records.set(record.path, record);
  }

  remove(path: string): void {
    this.records.delete(path);
  }

  has(path: string): boolean {
    return this.records.has(path);
  }

  aggregate(bounds: PeriodBounds): PeriodAggregate {
    return aggregateRecords(this.records.values(), bounds);
  }

  getByIsoDate(isoDate: string): DailyRecord | null {
    for (const record of this.records.values()) {
      if (record.isoDate === isoDate) return record;
    }
    return null;
  }

  get size(): number {
    return this.records.size;
  }
}
