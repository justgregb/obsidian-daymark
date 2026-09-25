import { describe, expect, it, vi } from "vitest";
import { fakeFile } from "./obsidian-fakes";
import DaymarkPlugin from "../src/main";
import { DaymarkChangeAccumulator } from "../src/change-set";
import { DEFAULT_SETTINGS } from "../src/types";

vi.mock("obsidian", async original => ({
  ...await original<Record<string, unknown>>(),
  Plugin: class {}, ItemView: class {}, Modal: class {}, PluginSettingTab: class {}
}));

interface Operation {
  path: string; sequence: number; kind: "refresh" | "remove"; contentChanged: boolean;
  dailyDates: Set<string>; touchesDailyNotes: boolean; touchesAdditionalWords: boolean; reportPaths: Set<string>;
}
interface Internals {
  processFileOperation: (operation: Operation, changes: DaymarkChangeAccumulator) => Promise<boolean>;
  operationRevisions: { isCurrent: () => boolean };
  matchesSummaryPath: () => boolean;
  usesAdditionalWordIndex: () => boolean;
}
function fixture(margin = true, linkedChanged = false) {
  const plugin = new DaymarkPlugin({} as never, {} as never);
  const internals = plugin as unknown as Internals;
  plugin.settings = { ...DEFAULT_SETTINGS, calendarLayout: margin ? "margin" : "standard" };
  const file = fakeFile("Journal/2026-09-21.md");
  plugin.app = { vault: { getAbstractFileByPath: () => file } } as never;
  const refreshLinks = vi.fn(async () => linkedChanged);
  const refresh = vi.fn(async () => {});
  plugin.index = { dateForFile: () => ({ year: 2026, month: 9, day: 21 }), linkedDatesForPath: () => [], refreshLinks, refresh } as never;
  internals.operationRevisions = { isCurrent: () => true };
  internals.matchesSummaryPath = () => false;
  internals.usesAdditionalWordIndex = () => false;
  const operation: Operation = { path: file.path, sequence: 1, kind: "refresh", contentChanged: false,
    dailyDates: new Set(["2026-09-21"]), touchesDailyNotes: true, touchesAdditionalWords: false, reportPaths: new Set() };
  const changes = new DaymarkChangeAccumulator();
  return { refreshLinks, refresh, operation, changes, run: () => internals.processFileOperation(operation, changes) };
}

describe("Margin metadata notifications", () => {
  it("does not emit a redraw when resolved writing is unchanged", async () => {
    const { refreshLinks, refresh, changes, run } = fixture();
    expect(await run()).toBe(true);
    expect(refreshLinks).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
    expect(changes.take()).toBeNull();
  });
  it("redraws a changed linked-writing total", async () => {
    const { changes, run } = fixture(true, true);
    await run();
    expect(changes.take()?.dailyDates).toEqual(["2026-09-21"]);
  });
  it("keeps ordinary content edits visible", async () => {
    const { refresh, operation, changes, run } = fixture();
    operation.contentChanged = true;
    await run();
    expect(refresh).toHaveBeenCalledOnce();
    expect(changes.take()?.dailyDates).toEqual(["2026-09-21"]);
  });
  it("preserves Standard's metadata-based cover refresh", async () => {
    const { changes, run } = fixture(false);
    await run();
    expect(changes.take()?.coverDates).toEqual(["2026-09-21"]);
  });
});
