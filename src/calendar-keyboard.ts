import { isCalendarNavigationKey, navigationIndex } from "./calendar-state";

export function installRovingNavigation(
  container: HTMLElement,
  selector: string,
  columns: number,
  preferredDate?: string
): void {
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(selector));
  if (buttons.length === 0) return;
  const preferred = preferredDate
    ? buttons.findIndex((button) => button.dataset.date === preferredDate)
    : -1;
  const current = preferred >= 0 ? preferred : Math.max(0, buttons.findIndex((button) => button.ariaCurrent === "date"));
  buttons.forEach((button, index) => {
    button.tabIndex = index === current ? 0 : -1;
    button.setAttr("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown Home End");
    button.addEventListener("focus", () => {
      buttons.forEach((candidate) => { candidate.tabIndex = candidate === button ? 0 : -1; });
    });
    button.addEventListener("keydown", (event) => {
      if (!isCalendarNavigationKey(event.key)) return;
      const sourceIndex = buttons.indexOf(button);
      const targetIndex = navigationIndex(sourceIndex, event.key, columns, buttons.length);
      if (targetIndex === null) return;
      event.preventDefault();
      buttons[targetIndex]?.focus();
    });
  });
}
