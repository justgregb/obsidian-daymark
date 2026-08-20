import { describe, expect, it } from "vitest";
import {
  moveCalendarViewport,
  moveYearViewport,
  selectCalendarDate
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
});
