import { todayPlainDate, toIsoDate } from "./date";

/** One local-midnight alarm, checked again after sleep, focus or a clock change. */
export function watchDayChange(win: Window, changed: (previous: string, current: string) => void): () => void {
  let current = toIsoDate(todayPlainDate());
  let timer: number;
  const check = (): void => {
    win.clearTimeout(timer);
    const next = toIsoDate(todayPlainDate());
    if (next !== current) {
      const previous = current;
      current = next;
      changed(previous, next);
    }
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 20);
    timer = win.setTimeout(check, Math.max(1, midnight.getTime() - Date.now()));
  };
  win.addEventListener("focus", check);
  win.document.addEventListener("visibilitychange", check);
  check();
  return () => {
    win.clearTimeout(timer);
    win.removeEventListener("focus", check);
    win.document.removeEventListener("visibilitychange", check);
  };
}
