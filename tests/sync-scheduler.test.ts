import { describe, expect, it } from "vitest";
import { PathOperationRevisions, prioritizeOperations, syncDatePriority } from "../src/sync-scheduler";

describe("sync scheduling", () => {
  it("marks an in-flight operation obsolete when the same path is queued again", () => {
    const revisions = new PathOperationRevisions();
    const first = { path: "Journal/2026-08-20.md", sequence: revisions.issue("Journal/2026-08-20.md") };
    const other = { path: "Journal/2026-08-21.md", sequence: revisions.issue("Journal/2026-08-21.md") };
    const latest = { path: first.path, sequence: revisions.issue(first.path) };

    expect(revisions.isCurrent(first)).toBe(false);
    expect(revisions.isCurrent(other)).toBe(true);
    expect(revisions.isCurrent(latest)).toBe(true);
    revisions.complete(first);
    expect(revisions.isCurrent(latest)).toBe(true);
    revisions.complete(latest);
    expect(revisions.isCurrent(latest)).toBe(false);
  });

  it("keeps equal-priority operations in their original order", () => {
    const operations = [
      { path: "background-a", priority: 2 },
      { path: "active", priority: 0 },
      { path: "visible", priority: 1 },
      { path: "background-b", priority: 2 }
    ];

    expect(prioritizeOperations(operations, (operation) => operation.priority).map(({ path }) => path))
      .toEqual(["active", "visible", "background-a", "background-b"]);
  });

  it("prioritizes the selected date, then the visible period", () => {
    const bounds = {
      start: { year: 2026, month: 8, day: 1 },
      end: { year: 2026, month: 9, day: 1 }
    };

    expect(syncDatePriority(["2026-08-20"], "2026-08-20", bounds)).toBe(0);
    expect(syncDatePriority(["2026-08-18"], "2026-08-20", bounds)).toBe(1);
    expect(syncDatePriority(["2025-08-18"], "2026-08-20", bounds)).toBe(2);
  });
});
