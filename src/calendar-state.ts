import { shiftAnchor } from "./date";
import type { PlainDate } from "./types";

export type CalendarNavigationKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";
export type YearMonthNavigationKey = CalendarNavigationKey;

export function isCalendarNavigationKey(value: string): value is CalendarNavigationKey {
  return value === "ArrowLeft"
    || value === "ArrowRight"
    || value === "ArrowUp"
    || value === "ArrowDown"
    || value === "Home"
    || value === "End";
}

export const isYearMonthNavigationKey = isCalendarNavigationKey;

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

export function navigationIndex(
  currentIndex: number,
  key: CalendarNavigationKey,
  columnCount: number,
  itemCount: number
): number | null {
  if (itemCount <= 0 || currentIndex < 0 || currentIndex >= itemCount) return null;
  const columns = Math.max(1, columnCount);
  let target = currentIndex;

  if (key === "ArrowLeft") target -= 1;
  else if (key === "ArrowRight") target += 1;
  else if (key === "ArrowUp") target -= columns;
  else if (key === "ArrowDown") target += columns;
  else if (key === "Home") target = 0;
  else target = itemCount - 1;

  return target >= 0 && target < itemCount ? target : null;
}

export const yearMonthNavigationIndex = navigationIndex;

export function yearMonthFocusIndex(
  displayedMonth: PlainDate,
  selectedDate: PlainDate,
  displayedYear: number
): number {
  const month = selectedDate.year === displayedYear ? selectedDate.month : displayedMonth.month;
  return Math.max(0, Math.min(11, month - 1));
}
