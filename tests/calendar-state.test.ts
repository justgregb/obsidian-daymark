import { describe, expect, it } from "vitest";
import {
  isCalendarNavigationKey,
  isYearMonthNavigationKey,
  moveCalendarViewport,
  moveYearViewport,
  navigationIndex,
  selectCalendarDate,
  yearMonthFocusIndex,
  yearMonthNavigationIndex
} from "../src/calendar-state";

describe("calendar view state", () => {
  it("moves the visible year without inventing a selected date in that year", () => {
    const selectedDate = { year: 2026, month: 8, day: 14 };
    const state = moveYearViewport({ year: 2026, month: 8, day: 1 }, selectedDate, 2028);

    expect(state.displayedMonth).toEqual({ year: 2028, month: 8, day: 1 });
    expect(state.selectedDate).toEqual({ year: 2026, month: 8, day: 14 });
  });

  it("moves the viewport to an explicitly selected day", () => {
    const state = selectCalendarDate({ year: 2027, month: 2, day: 18 });

    expect(state.displayedMonth).toEqual({ year: 2027, month: 2, day: 1 });
    expect(state.displayedWeek).toEqual({ year: 2027, month: 2, day: 18 });
    expect(state.selectedDate).toEqual({ year: 2027, month: 2, day: 18 });
  });

  it("moves week and month viewports without moving the selected date", () => {
    const selectedDate = { year: 2026, month: 8, day: 14 };
    const initial = {
      displayedMonth: { year: 2026, month: 8, day: 1 },
      displayedWeek: { year: 2026, month: 8, day: 10 },
      selectedDate
    };

    const nextWeek = moveCalendarViewport(initial, "week", 1);
    expect(nextWeek.displayedWeek).toEqual({ year: 2026, month: 8, day: 17 });
    expect(nextWeek.selectedDate).toBe(selectedDate);

    const nextMonth = moveCalendarViewport(nextWeek, "month", 1);
    expect(nextMonth.displayedMonth).toEqual({ year: 2026, month: 9, day: 1 });
    expect(nextMonth.displayedWeek).toEqual({ year: 2026, month: 8, day: 17 });
    expect(nextMonth.selectedDate).toBe(selectedDate);
  });

  it("navigates Year-view months using the rendered column count", () => {
    expect(yearMonthNavigationIndex(5, "ArrowLeft", 3, 12)).toBe(4);
    expect(yearMonthNavigationIndex(5, "ArrowRight", 3, 12)).toBe(6);
    expect(yearMonthNavigationIndex(5, "ArrowUp", 3, 12)).toBe(2);
    expect(yearMonthNavigationIndex(5, "ArrowDown", 3, 12)).toBe(8);
    expect(yearMonthNavigationIndex(5, "Home", 3, 12)).toBe(0);
    expect(yearMonthNavigationIndex(5, "End", 3, 12)).toBe(11);
  });

  it("does not wrap keyboard focus past the first or last month", () => {
    expect(yearMonthNavigationIndex(0, "ArrowLeft", 4, 12)).toBeNull();
    expect(yearMonthNavigationIndex(1, "ArrowUp", 4, 12)).toBeNull();
    expect(yearMonthNavigationIndex(11, "ArrowRight", 4, 12)).toBeNull();
    expect(yearMonthNavigationIndex(9, "ArrowDown", 4, 12)).toBeNull();
  });

  it("recognizes only the keys owned by the Year month grid", () => {
    expect(isYearMonthNavigationKey("ArrowLeft")).toBe(true);
    expect(isYearMonthNavigationKey("End")).toBe(true);
    expect(isYearMonthNavigationKey("Enter")).toBe(false);
    expect(isYearMonthNavigationKey("Tab")).toBe(false);
  });

  it("lands Year keyboard focus on the selected month or the viewport anchor", () => {
    expect(yearMonthFocusIndex(
      { year: 2026, month: 3, day: 1 },
      { year: 2026, month: 8, day: 14 },
      2026
    )).toBe(7);
    expect(yearMonthFocusIndex(
      { year: 2028, month: 3, day: 1 },
      { year: 2026, month: 8, day: 14 },
      2028
    )).toBe(2);
  });

  it("uses the same navigation model for month and week controls", () => {
    expect(navigationIndex(8, "ArrowUp", 7, 42)).toBe(1);
    expect(navigationIndex(8, "ArrowDown", 7, 42)).toBe(15);
    expect(navigationIndex(3, "ArrowUp", 1, 7)).toBe(2);
    expect(navigationIndex(3, "ArrowDown", 1, 7)).toBe(4);
    expect(isCalendarNavigationKey("ArrowDown")).toBe(true);
  });
});
