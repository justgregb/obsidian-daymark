import { afterEach, describe, expect, it, vi } from "vitest";
import { watchDayChange } from "../src/day-rollover";

function fixture() {
  const win = Object.assign(new EventTarget(), { document: new EventTarget(), setTimeout, clearTimeout });
  const changed = vi.fn();
  const dispose = watchDayChange(win as unknown as Window, changed);
  return { win, changed, dispose };
}
afterEach(() => vi.useRealTimers());
describe("local day rollover", () => {
  it("moves Today once at local midnight and maintains only one next-midnight alarm", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 21, 23, 59, 59));
    const { changed, dispose } = fixture();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1020);
    expect(changed).toHaveBeenCalledExactlyOnceWith("2026-09-21", "2026-09-22");
    expect(vi.getTimerCount()).toBe(1);
    dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it("catches up after sleep and ignores repeated focus/visibility on the same date", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 21, 12));
    const { win, changed, dispose } = fixture();
    win.dispatchEvent(new Event("focus"));
    win.document.dispatchEvent(new Event("visibilitychange"));
    expect(changed).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(1);
    vi.setSystemTime(new Date(2026, 8, 24, 9));
    win.dispatchEvent(new Event("focus"));
    win.document.dispatchEvent(new Event("visibilitychange"));
    expect(changed).toHaveBeenCalledExactlyOnceWith("2026-09-21", "2026-09-24");
    dispose();
    vi.setSystemTime(new Date(2026, 8, 25, 9));
    win.dispatchEvent(new Event("focus"));
    expect(changed).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("reschedules after the local clock moves backwards", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 22, 2));
    const { win, changed, dispose } = fixture();
    vi.setSystemTime(new Date(2026, 8, 21, 23, 59, 59));
    win.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(1020);
    expect(changed.mock.calls).toEqual([["2026-09-22", "2026-09-21"], ["2026-09-21", "2026-09-22"]]);
    dispose();
  });
});
