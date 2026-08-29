import { describe, expect, it } from "vitest";
import { createDiagnosticsReport } from "../src/diagnostics";

describe("local diagnostics", () => {
  it("reports performance counts without including vault paths or note contents", () => {
    const report = createDiagnosticsReport({
      version: "0.2.5",
      platform: "mobile",
      dailyIndex: { recordCount: 480, lastRebuildFileCount: 480, lastRebuildDurationMs: 42.25 },
      additionalIndex: { recordCount: 12, lastRebuildFileCount: 12, lastRebuildDurationMs: 4 },
      additionalIndexEnabled: true,
      pendingOperationCount: 2,
      coalescedOperationCount: 8,
      recentSyncBatches: [
        { operationCount: 10, processedCount: 8, supersededCount: 2, durationMs: 15.25 },
        { operationCount: 5, processedCount: 5, supersededCount: 0, durationMs: 8 }
      ]
    });

    expect(report).toContain("Daily-note records: 480");
    expect(report).toContain("480 files in 42 ms");
    expect(report).toContain("15 queued · 13 processed · 2 superseded");
    expect(report).toContain("23 ms");
    expect(report).toContain("counts and timings only");
    expect(report).not.toContain("Journal/");
  });

  it("keeps unused indexes and missing rebuilds explicit", () => {
    const report = createDiagnosticsReport({
      version: "0.2.5",
      platform: "desktop",
      dailyIndex: { recordCount: 0, lastRebuildFileCount: null, lastRebuildDurationMs: null },
      additionalIndex: { recordCount: 0, lastRebuildFileCount: null, lastRebuildDurationMs: null },
      additionalIndexEnabled: false,
      pendingOperationCount: 0,
      coalescedOperationCount: 0,
      recentSyncBatches: []
    });

    expect(report).toContain("Last daily index rebuild: not run");
    expect(report).toContain("Additional writing index: disabled");
    expect(report).not.toContain("Additional writing records:");
  });
});
