import { isCalendarNavigationKey, navigationIndex } from "./calendar-state";

function matchingNavigationButton(
  container: HTMLElement,
  selector: string,
  target: EventTarget | null
): HTMLButtonElement | null {
  if (!(target instanceof HTMLButtonElement)) return null;
  if (!target.matches(selector) || !container.contains(target)) return null;
  return target;
}

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
  });

  container.addEventListener("focusin", (event) => {
    const button = matchingNavigationButton(container, selector, event.target);
    if (!button) return;
    buttons.forEach((candidate) => { candidate.tabIndex = candidate === button ? 0 : -1; });
  });
  container.addEventListener("keydown", (event) => {
    const button = matchingNavigationButton(container, selector, event.target);
    if (!button || !isCalendarNavigationKey(event.key)) return;
    const sourceIndex = buttons.indexOf(button);
    const targetIndex = navigationIndex(sourceIndex, event.key, columns, buttons.length);
    if (targetIndex === null) return;
    event.preventDefault();
    buttons[targetIndex]?.focus();
  });
}
