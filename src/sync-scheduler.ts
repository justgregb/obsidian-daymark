export interface VersionedPathOperation {
  path: string;
  sequence: number;
}

export class PathOperationRevisions {
  private sequence = 0;
  private readonly latestByPath = new Map<string, number>();

  issue(path: string): number {
    this.sequence += 1;
    this.latestByPath.set(path, this.sequence);
    return this.sequence;
  }

  isCurrent(operation: VersionedPathOperation): boolean {
    return this.latestByPath.get(operation.path) === operation.sequence;
  }

  complete(operation: VersionedPathOperation): void {
    if (this.isCurrent(operation)) this.latestByPath.delete(operation.path);
  }

  clear(): void {
    this.latestByPath.clear();
  }
}

export function prioritizeOperations<T>(
  operations: readonly T[],
  priority: (operation: T) => number
): T[] {
  return operations
    .map((operation, index) => ({ operation, index, priority: priority(operation) }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .map(({ operation }) => operation);
}

export function syncDatePriority(
  dates: Iterable<string>,
  selectedDate: string,
  visibleBounds: PeriodBounds
): 0 | 1 | 2 {
  let priority: 0 | 1 | 2 = 2;
  for (const isoDate of dates) {
    if (isoDate === selectedDate) return 0;
    const date = parseIsoDate(isoDate);
    if (date && dateIsWithin(date, visibleBounds)) priority = 1;
  }
  return priority;
}
import { dateIsWithin, parseIsoDate } from "./date";
import type { PeriodBounds } from "./types";
