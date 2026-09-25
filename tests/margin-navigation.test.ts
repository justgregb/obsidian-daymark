import { describe, expect, it, vi } from "vitest";
import type { ViewStateResult, WorkspaceLeaf } from "obsidian";
import { DaymarkCalendarView } from "../src/calendar-view";
import type DaymarkPlugin from "../src/main";
import { DEFAULT_SETTINGS, type DailyRecord, type PlainDate } from "../src/types";
import type { MarginTimelineOptions } from "../src/margin-timeline";
import { todayPlainDate, toIsoDate } from "../src/date";
import { parseDailyNote } from "../src/parser";
import { aggregateRecords } from "../src/aggregate";
import type { DaymarkChangeSet } from "../src/change-set";
import type { PeriodBounds } from "../src/types";
import type { createMarginTally } from "../src/margin-tally-view";

const harness = vi.hoisted(() => ({ options: null as MarginTimelineOptions | null, scrollToDate: vi.fn(), refreshDates: vi.fn(),
  tally: null as Parameters<typeof createMarginTally>[1] | null }));
vi.mock("../src/margin-tally-view", () => ({
  createMarginTally: (_parent: HTMLElement, context: Parameters<typeof createMarginTally>[1]) => { harness.tally = context; return Object.assign(() => {}, { update: (next: Parameters<typeof createMarginTally>[1]) => { harness.tally = next; } }); }
}));
vi.mock("obsidian", async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), Platform: { isMobile: false },
  ItemView: class {
    contentEl = { ownerDocument: { activeElement: null }, querySelector: () => null };
    containerEl = { addClass: vi.fn() };
    app = { vault: { on: vi.fn() }, workspace: { on: vi.fn(), getActiveFile: vi.fn() } };
    registerEvent = vi.fn();
    setState(): Promise<void> { return Promise.resolve(); }
  }
}));
vi.mock("../src/margin-timeline", async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  MarginTimeline: class {
    constructor(_parent: HTMLElement, options: MarginTimelineOptions) { harness.options = options; }
    snapshot() { return harness.options!.anchor; }
    scrollToDate = harness.scrollToDate;
    refreshDates = harness.refreshDates;
    dispose(): void {}
  }
}));
interface ViewInternals {
  opened: boolean;
  marginLensId: string | null;
  renderTodayIso: string;
  marginTallySlot: HTMLElement;
  renderLoading: () => void;
  renderError: (error: unknown) => void;
  applyPluginChange: (change: DaymarkChangeSet) => void;
  renderFooterOnly: () => void;
  createMarginView: (body: HTMLElement) => void;
  refreshMarginHeader: () => void;
  saveViewState: () => void;
  render: () => void;
  updateVisibleSelection: (previous: string, current: string) => void;
  selectDate: (date: PlainDate, openNote: boolean) => void;
  marginNavigation: () => { onToday: () => void };
}
async function fixture() {
  harness.scrollToDate.mockClear();
  harness.refreshDates.mockReset();
  const plugin = { locale: "en", settings: { ...DEFAULT_SETTINGS, calendarLayout: "margin" }, resolveWeekStart: () => 1,
    subscribe: vi.fn(() => () => {}), ensureCalendarReady: vi.fn(async () => {}),
    openOrCreateDailyNote: vi.fn(async () => {}), index: { recordForDate: (): DailyRecord | null => null,
      aggregate: vi.fn((bounds: PeriodBounds) => aggregateRecords([], bounds)) } };
  const view = new DaymarkCalendarView({} as WorkspaceLeaf, plugin as unknown as DaymarkPlugin);
  const internals = view as unknown as ViewInternals;
  internals.refreshMarginHeader = vi.fn(); internals.saveViewState = vi.fn(); internals.render = vi.fn();
  internals.updateVisibleSelection = vi.fn();
  await view.setState({ month: "2026-09-01", selectedDate: "2026-09-21", marginScroll: { date: "2026-09-10", fraction: 0.5 } }, {} as ViewStateResult);
  internals.opened = true;
  internals.createMarginView({} as HTMLElement);
  return { view, internals, plugin };
}
function change(overrides: Partial<DaymarkChangeSet> = {}): DaymarkChangeSet {
  return { full: false, dailyDates: [], dailyPaths: [], coverDates: [], additionalWords: false, reportPaths: [], ...overrides };
}

describe("Margin scrolling and selection integration", () => {
  it("retains unrelated cached month lenses through partial updates", async () => {
    const { internals, view, plugin } = await fixture();
    internals.marginLensId = "words";
    internals.createMarginView({} as HTMLElement);
    const context = harness.options!.contextForMonth;
    const september = { year: 2026, month: 9, day: 1 }, october = { year: 2026, month: 10, day: 1 };
    const first = context(september).lens, second = context(october).lens;
    plugin.index.aggregate.mockClear();
    internals.applyPluginChange(change({ additionalWords: true }));
    expect(context(september).lens).toBe(first);
    expect(context(october).lens).toBe(second);
    expect(plugin.index.aggregate).not.toHaveBeenCalled();
    internals.applyPluginChange(change({ dailyDates: ["2026-09-20"] }));
    expect(context(october).lens).toBe(second);
    expect(context(september).lens).not.toBe(first);
    expect(plugin.index.aggregate).toHaveBeenCalledOnce();
    expect(view.getState().marginLens).toBe("words");
  });
  it("moves an old Today mark during a partial update after the date changes", async () => {
    const { internals } = await fixture();
    internals.renderTodayIso = "2020-01-01";
    internals.applyPluginChange(change({ dailyDates: ["2026-10-01"] }));
    expect(harness.refreshDates).toHaveBeenCalledWith(["2026-10-01", "2020-01-01", internals.renderTodayIso], false);
    expect(internals.renderTodayIso).not.toBe("2020-01-01");
    expect(internals.render).not.toHaveBeenCalled();
  });
  it("leaves month aggregation deferred while the header has neither an open summary nor an active lens", async () => {
    const { internals, plugin, view } = await fixture();
    internals.marginTallySlot = { empty: vi.fn() } as unknown as HTMLElement;
    const refreshHeader = (DaymarkCalendarView.prototype as unknown as ViewInternals).refreshMarginHeader;
    refreshHeader.call(view);
    expect(plugin.index.aggregate).not.toHaveBeenCalled();
    expect(harness.tally?.lens).toBeNull();
    const initial = harness.tally;
    refreshHeader.call(view);
    expect(harness.tally).not.toBe(initial);
    expect(plugin.index.aggregate).not.toHaveBeenCalled();
    harness.tally!.lenses();
    expect(plugin.index.aggregate).toHaveBeenCalledOnce();
  });
  it.each([false, true])("ignores index completion after the view closes (failure=%s)", async failed => {
    const { view, internals, plugin } = await fixture();
    internals.renderLoading = vi.fn(); internals.renderError = vi.fn();
    let finish!: () => void;
    plugin.ensureCalendarReady.mockImplementationOnce(() => new Promise<void>((resolve, reject) => {
      finish = () => failed ? reject(new Error("Closed index")) : resolve();
    }));
    const opening = view.onOpen();
    internals.opened = false;
    finish();
    await opening;
    expect(internals.render).not.toHaveBeenCalled();
    expect(internals.renderError).not.toHaveBeenCalled();
  });
  it("skips date rebuilds for edits outside the loaded months and invalidates visited lens values", async () => {
    const { internals, plugin } = await fixture();
    internals.marginLensId = "words";
    const month = { year: 2025, month: 1, day: 1 };
    harness.options!.contextForMonth(month);
    harness.options!.contextForMonth(month);
    expect(plugin.index.aggregate).toHaveBeenCalledOnce();
    internals.applyPluginChange(change({ dailyDates: ["2025-01-02"] }));
    expect(internals.render).not.toHaveBeenCalled();
    expect(internals.refreshMarginHeader).not.toHaveBeenCalled();
    harness.options!.contextForMonth(month);
    expect(plugin.index.aggregate).toHaveBeenCalledTimes(2);
  });
  it("refreshes buffered dates even when they are outside the header's month", async () => {
    const { internals } = await fixture();
    internals.applyPluginChange(change({ dailyDates: ["2026-10-01"] }));
    expect(harness.refreshDates).toHaveBeenCalledExactlyOnceWith(["2026-10-01"], false);
    expect(internals.render).not.toHaveBeenCalled();
  });
  it("refreshes an open Tally after report changes without rebuilding dates", async () => {
    const { view, internals } = await fixture();
    await view.setState({ marginTallyExpanded: true }, {} as ViewStateResult);
    vi.mocked(internals.render).mockClear();
    internals.applyPluginChange(change({ reportPaths: ["Tally/September.md"] }));
    expect(internals.refreshMarginHeader).toHaveBeenCalledOnce();
    expect(internals.render).not.toHaveBeenCalled();
  });
  it("updates the Margin summary without replacing the date list", async () => {
    const { internals } = await fixture();
    internals.renderFooterOnly();
    expect(internals.refreshMarginHeader).toHaveBeenCalledOnce();
    expect(internals.render).not.toHaveBeenCalled();
  });
  it("uses the middle date for the header/Tally even while the previous month is visible above", async () => {
    const { view, internals, plugin } = await fixture();
    harness.options!.onScroll({ date: "2026-09-21", fraction: 0.8 }, { year: 2026, month: 9, day: 26 });
    expect(internals.refreshMarginHeader).not.toHaveBeenCalled();
    harness.options!.onScroll({ date: "2026-09-26", fraction: 0 }, { year: 2026, month: 10, day: 1 });
    expect(internals.refreshMarginHeader).toHaveBeenCalledOnce();
    expect(view.getState()).toMatchObject({ month: "2026-10-01", selectedDate: "2026-09-21" });
    expect(internals.render).not.toHaveBeenCalled();
    expect(plugin.openOrCreateDailyNote).not.toHaveBeenCalled();
  });
  it("selects a visible adjacent-month note without changing the viewport month or rebuilding rows", async () => {
    const { view, internals, plugin } = await fixture();
    const date = { year: 2026, month: 10, day: 2 };
    internals.selectDate(date, true);
    expect(view.getState()).toMatchObject({ month: "2026-09-01", selectedDate: "2026-10-02" });
    expect(harness.scrollToDate).toHaveBeenCalledExactlyOnceWith(date, "nearest");
    expect(internals.updateVisibleSelection).toHaveBeenCalledWith("2026-09-21", "2026-10-02");
    expect(internals.render).not.toHaveBeenCalled();
    expect(plugin.openOrCreateDailyNote).toHaveBeenCalledExactlyOnceWith(date);
  });
  it.each([false, true])("centers and selects Today without opening or creating a note, existing=%s", async exists => {
    const { view, internals, plugin } = await fixture();
    const today = todayPlainDate();
    const iso = toIsoDate(today);
    plugin.index.recordForDate = () => exists ? parseDailyNote(`Journal/${iso}.md`, iso, today, "Today's writing", "en") : null;
    const navigation = internals.marginNavigation();
    expect(Object.keys(navigation)).toEqual(["onToday"]);
    navigation.onToday();
    const date = harness.scrollToDate.mock.calls[0][0] as PlainDate;
    expect(harness.scrollToDate).toHaveBeenCalledExactlyOnceWith(date, "center");
    expect(view.getState().selectedDate).toBe(toIsoDate(date));
    expect(plugin.openOrCreateDailyNote).not.toHaveBeenCalled();
  });
  it("explicitly reveals a requested Tally month", async () => {
    const { view, internals } = await fixture();
    view.showPeriod("month", { year: 2027, month: 1, day: 18 });
    expect(harness.scrollToDate).toHaveBeenCalledWith({ year: 2027, month: 1, day: 1 }, "center");
    expect(internals.render).toHaveBeenCalledOnce();
    expect(view.getState()).toMatchObject({ month: "2027-01-01", marginTallyExpanded: true });
  });
});
