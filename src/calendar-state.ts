import { shiftAnchor } from "./date";
import type { PlainDate } from "./types";

export interface CalendarSelectionState {
  displayedMonth: PlainDate;
  selectedDate: PlainDate;
}

export interface CalendarViewportState extends CalendarSelectionState {
  displayedWeek: PlainDate;
}

export function selectCalendarDate(date: PlainDate): CalendarViewportState {
  return {
    displayedMonth: { year: date.year, month: date.month, day: 1 },
    displayedWeek: date,
    selectedDate: date
  };
}

export function moveCalendarViewport(
  state: CalendarViewportState,
  mode: "week" | "month",
  amount: number
): CalendarViewportState {
  if (mode === "week") {
    const displayedWeek = shiftAnchor(state.displayedWeek, "week", amount);
    return {
      ...state,
      displayedMonth: { year: displayedWeek.year, month: displayedWeek.month, day: 1 },
      displayedWeek
    };
  }

  const displayedMonth = shiftAnchor(state.displayedMonth, "month", amount);
  return {
    ...state,
    displayedMonth: { year: displayedMonth.year, month: displayedMonth.month, day: 1 }
  };
}

export function moveYearViewport(
  displayedMonth: PlainDate,
  selectedDate: PlainDate,
  targetYear: number
): CalendarSelectionState {
  return {
    displayedMonth: shiftAnchor(displayedMonth, "year", targetYear - displayedMonth.year),
    selectedDate
  };
}
