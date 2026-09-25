import { describe, expect, it, vi } from "vitest";
import type { ViewStateResult, WorkspaceLeaf } from "obsidian";
import { DaymarkCalendarView } from "../src/calendar-view";
import type DaymarkPlugin from "../src/main";
import { DEFAULT_SETTINGS, type DaymarkSettings } from "../src/types";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  Platform: { isMobile: false },
  ItemView: class {
    setState(): Promise<void> { return Promise.resolve(); }
  }
}));

function fixture(settings: DaymarkSettings) {
  const plugin = { settings, resolveWeekStart: () => 1 } as unknown as DaymarkPlugin;
  const view = new DaymarkCalendarView({} as WorkspaceLeaf, plugin);
  return { view, plugin };
}

describe("margin view state", () => {
  it("persists the chosen lens separately from names, dates, and the Standard calendar", async () => {
    const { view, plugin } = fixture({ ...DEFAULT_SETTINGS, calendarLayout: "margin", dayNames: { "2026-09-19": "Test" } });
    await view.setState({ mode: "week", month: "2026-09-01", selectedDate: "2026-09-19", marginLens: "tag:SWIMMING" }, {} as ViewStateResult);
    expect(view.getState()).toMatchObject({ mode: "week", month: "2026-09-01", selectedDate: "2026-09-19", marginLens: "tag:swimming" });
    expect(plugin.settings.dayNames).toEqual({ "2026-09-19": "Test" });
    await view.setState({ marginLens: "invalid" }, {} as ViewStateResult);
    expect(view.getState().marginLens).toBeNull();
  });
  it("restores a date and fractional-row scroll anchor independently of the selected note", async () => {
    const { view } = fixture({ ...DEFAULT_SETTINGS, calendarLayout: "margin" });
    await view.setState({ month: "2026-10-01", selectedDate: "2026-09-21", marginScroll: { date: "2026-10-12", fraction: 0.4 } }, {} as ViewStateResult);
    expect(view.getState()).toMatchObject({ selectedDate: "2026-09-21", marginScroll: { date: "2026-10-12", fraction: 0.4 } });
    await view.setState({ marginScroll: { date: "broken", fraction: 0 } }, {} as ViewStateResult);
    expect(view.getState().marginScroll).toBeNull();
  });

  it("uses monthly bounds without overwriting the saved Standard view", async () => {
    const { view, plugin } = fixture({ ...DEFAULT_SETTINGS, calendarLayout: "margin" });
    await view.setState({
      mode: "year", month: "2026-09-01", selectedDate: "2026-09-17", tallyExpanded: true
    }, {} as ViewStateResult);
    expect(view.syncPriorityForDates(["2026-09-12"])).toBe(1);
    expect(view.syncPriorityForDates(["2026-02-12"])).toBe(2);
    expect(view.getState()).toMatchObject({
      mode: "year", tallyExpanded: true, marginTallyExpanded: false, selectedDate: "2026-09-17"
    });
    plugin.settings = { ...plugin.settings, calendarLayout: "standard" };
    expect(view.syncPriorityForDates(["2026-02-12"])).toBe(1);
    expect(view.getState().mode).toBe("year");
  });

  it("restores independent Tally preferences and ignores invalid saved values", async () => {
    const { view } = fixture({ ...DEFAULT_SETTINGS, calendarLayout: "margin" });
    await view.setState({
      mode: "week", month: "2026-09-01", tallyExpanded: false, marginTallyExpanded: true
    }, {} as ViewStateResult);
    expect(view.getState()).toMatchObject({ mode: "week", tallyExpanded: false, marginTallyExpanded: true });
    await view.setState({ mode: "bad", tallyExpanded: "yes", marginTallyExpanded: "no" }, {} as ViewStateResult);
    expect(view.getState()).toMatchObject({ mode: "week", tallyExpanded: false, marginTallyExpanded: true });
  });
});
