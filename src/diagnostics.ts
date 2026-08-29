export interface IndexDiagnostics {
  recordCount: number;
  lastRebuildFileCount: number | null;
  lastRebuildDurationMs: number | null;
}

export interface SyncBatchDiagnostics {
  operationCount: number;
  processedCount: number;
  supersededCount: number;
  durationMs: number;
}

export interface DaymarkDiagnosticsSnapshot {
  version: string;
  platform: "desktop" | "mobile";
  dailyIndex: IndexDiagnostics;
  additionalIndex: IndexDiagnostics;
  additionalIndexEnabled: boolean;
  pendingOperationCount: number;
  coalescedOperationCount: number;
  recentSyncBatches: readonly SyncBatchDiagnostics[];
}

export function monotonicNow(): number {
  return typeof window === "undefined" ? Date.now() : window.performance.now();
}

export function createDiagnosticsReport(snapshot: DaymarkDiagnosticsSnapshot): string {
  const recent = snapshot.recentSyncBatches;
  const recentOperations = sum(recent, (batch) => batch.operationCount);
  const recentProcessed = sum(recent, (batch) => batch.processedCount);
  const recentSuperseded = sum(recent, (batch) => batch.supersededCount);
  const recentDuration = sum(recent, (batch) => batch.durationMs);
  const lines = [
    "Daymark diagnostics",
    `Version: ${snapshot.version}`,
    `Platform: ${snapshot.platform}`,
    `Daily-note records: ${snapshot.dailyIndex.recordCount}`,
    `Last daily index rebuild: ${formatRebuild(snapshot.dailyIndex)}`,
    `Additional writing index: ${snapshot.additionalIndexEnabled ? "enabled" : "disabled"}`
  ];

  if (snapshot.additionalIndexEnabled) {
    lines.push(`Additional writing records: ${snapshot.additionalIndex.recordCount}`);
    lines.push(`Last additional index rebuild: ${formatRebuild(snapshot.additionalIndex)}`);
  }

  lines.push(
    `Pending sync operations: ${snapshot.pendingOperationCount}`,
    `Coalesced sync events since load: ${snapshot.coalescedOperationCount}`,
    `Recent sync batches: ${recent.length}`,
    `Recent sync operations: ${recentOperations} queued · ${recentProcessed} processed · ${recentSuperseded} superseded`,
    `Recent sync processing time: ${formatDuration(recentDuration)}`,
    "",
    "This report contains counts and timings only. It does not include note names, paths, or contents."
  );
  return lines.join("\n");
}

function formatRebuild(index: IndexDiagnostics): string {
  if (index.lastRebuildDurationMs === null || index.lastRebuildFileCount === null) return "not run";
  return `${index.lastRebuildFileCount} files in ${formatDuration(index.lastRebuildDurationMs)}`;
}

function formatDuration(value: number): string {
  return `${Math.max(0, value).toFixed(value < 10 ? 1 : 0)} ms`;
}

function sum<T>(values: readonly T[], select: (value: T) => number): number {
  let total = 0;
  for (const value of values) total += select(value);
  return total;
}
