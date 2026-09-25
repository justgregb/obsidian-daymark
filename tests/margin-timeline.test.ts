import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarginTimeline, marginScrollAnchor, marginScrollOffset, normalizeMarginScroll } from "../src/margin-timeline";
import { addDays, parseIsoDate, toDate, toIsoDate } from "../src/date";
import { DEFAULT_SETTINGS, type PlainDate, type DailyRecord } from "../src/types";
import { parseDailyNote } from "../src/parser";
import type { MarginCalendarContext } from "../src/margin-calendar-view";

// Deterministic layout harness: no browser, Obsidian session, or background render.
const layout = vi.hoisted(() => ({ height: 24, extra: new Map<string, number>(), frames: new Map<number, FrameRequestCallback>(), sequence: 0, resize: () => {}, nativeScrollEnd: true, windowListeners: new Map<string, EventListener>(), timers: new Map<number, () => void>() }));
vi.mock("../src/margin-calendar-view", () => ({
  labelForReader: () => undefined,
  createMarginFold(parent: NodeStub, range: { start: string; end: string }, _locale: string, toggle: () => void) {
    const row = parent.createDiv("daymark-margin-fold");
    row.dataset.fold = range.start; row.dataset.end = range.end;
    row.foldToggle = toggle;
    return { row, button: row.buttons[0], update(expanded: boolean) { row.dataset.expanded = String(expanded); } };
  },
  createMarginMonthLabel(parent: NodeStub, month: PlainDate) {
    const label = parent.createDiv("daymark-margin-month-boundary");
    label.dataset.month = toIsoDate(month);
    return label;
  },
  createMarginDay(parent: NodeStub, date: PlainDate, _record: unknown, context: MarginCalendarContext) {
    const row = parent.createDiv("daymark-margin-day");
    row.dataset.date = toIsoDate(date);
    row.dataset.lens = context.lens?.label ?? "";
    row.toggleClass("is-highlighted", context.settings.highlightedWeekdays.some(day => day === toDate(date).getUTCDay()));
    row.changeLayout = context.onLayoutChange;
    return row;
  }
}));

class NodeStub {
  children: NodeStub[] = [];
  parent: NodeStub | null = null;
  dataset: Record<string, string> = {};
  hidden = false;
  foldToggle?: () => void;
  scrollTop = 0;
  clientHeight = 240;
  changeLayout?: (change: () => void) => void;
  props: Record<string, string> = {};
  classes = new Set<string>();
  classList = { contains: (name: string) => this.classes.has(name) };
  toggleClass(name: string, enabled: boolean): void { if (enabled) this.classes.add(name); else this.classes.delete(name); }
  buttons = [{ tabIndex: 0 }];
  querySelectorAll = vi.fn(() => this.buttons);
  querySelector(): null { return null; }
  style = { setProperty: (key: string, value: string) => { this.props[key] = value; }, getPropertyValue: (key: string) => this.props[key] ?? "" };
  listeners = new Map<string, EventListener>();
  ownerDocument = { defaultView: {
    requestAnimationFrame: (callback: FrameRequestCallback) => { layout.frames.set(++layout.sequence, callback); return layout.sequence; },
    cancelAnimationFrame: (id: number) => layout.frames.delete(id),
    addEventListener: (name: string, listener: EventListener) => layout.windowListeners.set(name, listener),
    removeEventListener: (name: string) => layout.windowListeners.delete(name),
    setTimeout: (callback: () => void) => { layout.timers.set(++layout.sequence, callback); return layout.sequence; },
    clearTimeout: (id: number) => layout.timers.delete(id)
  } };
  constructor(readonly cls = "") { if (layout.nativeScrollEnd) Object.defineProperty(this, "onscrollend", { value: null }); }
  createDiv(cls: string): NodeStub {
    const node = new NodeStub(cls); node.parent = this; this.children.push(node); return node;
  }
  setAttr(): void {}
  get firstElementChild(): NodeStub | null { return this.children[0] ?? null; }
  get nextElementSibling(): NodeStub | null { return this.parent?.children[(this.parent.children.indexOf(this)) + 1] ?? null; }
  getBoundingClientRect() { return { height: this.hidden ? 0 : layout.height + (layout.extra.get(this.dataset.date) ?? 0) }; }
  remove(): void { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  replaceWith(node: NodeStub): void { const parent = this.parent!; parent.insertBefore(node, this); this.remove(); }
  insertBefore(node: NodeStub, next: NodeStub | null): void {
    node.remove(); node.parent = this;
    this.children.splice(next ? this.children.indexOf(next) : this.children.length, 0, node);
  }
  addEventListener(name: string, listener: EventListener): void { this.listeners.set(name, listener); }
  removeEventListener(name: string): void { this.listeners.delete(name); }
}

const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
beforeEach(() => {
  layout.height = 24; layout.extra.clear(); layout.frames.clear(); layout.nativeScrollEnd = true; layout.windowListeners.clear(); layout.timers.clear();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { layout.resize = callback; }
    observe = observer.observe;
    unobserve = observer.unobserve;
    disconnect = observer.disconnect;
  });
});
afterEach(() => { vi.unstubAllGlobals(); });
function flush(): void {
  const callbacks = [...layout.frames.values()]; layout.frames.clear();
  for (const callback of callbacks) callback(0);
}
function idle(): void {
  const callbacks = [...layout.timers.values()]; layout.timers.clear();
  for (const callback of callbacks) callback();
}
function record(words = 800, photos = 0): DailyRecord {
  return { ...parseDailyNote("Journal/2026-09-01.md", "2026-09-01", { year: 2026, month: 9, day: 1 }, "", "en"), words, photos };
}
function fixture(iso = "2026-09-01", records = new Map<string, DailyRecord>(), values = new Map<string, number>(), draft: MarginCalendarContext["nameEditor"]["draft"] = null, todayIso = "", selectedIso = "") {
  const parent = new NodeStub();
  const nameEditor: MarginCalendarContext["nameEditor"] = { draft };
  const onSelect = vi.fn(); const onNameChange = vi.fn(async () => {}); const onScroll = vi.fn();
  const recordForDate = vi.fn((date: PlainDate) => records.get(toIsoDate(date)) ?? null);
  const settings = { ...DEFAULT_SETTINGS, dayNames: { ...DEFAULT_SETTINGS.dayNames } };
  const state = { todayIso, selectedIso, maximum: 10, lens: true };
  const timeline = new MarginTimeline(parent as unknown as HTMLElement, {
    anchor: { date: iso, fraction: 0 }, recordForDate,
    contextForMonth: month => ({ locale: "en", settings, selectedIso: state.selectedIso, todayIso: state.todayIso,
      nameEditor, onSelect, onNameChange, lens: state.lens ? { id: "words", label: `month-${month.month}`, total: 0, maximum: state.maximum, values } : null }),
    onScroll
  });
  const dates = parent.children[0].children[0].children[0];
  const scroll = (iso: string, fraction = 0, ended = true) => {
    dates.scrollTop = marginScrollOffset(parseIsoDate(dates.children[0].dataset.month ?? dates.children[0].dataset.date)!, { date: iso, fraction }, layout.height);
    dates.listeners.get("scroll")?.({} as Event); flush();
    if (ended) {
      if (layout.nativeScrollEnd) dates.listeners.get("scrollend")?.({} as Event);
      else idle();
    }
  };
  return { timeline, dates, scroll, onSelect, onNameChange, onScroll, nameEditor, recordForDate, records, values, state, settings };
}

describe("continuous Margin timeline", () => {
  it("ignores late date updates after disposal", () => {
    const { timeline, dates, records, recordForDate, onScroll } = fixture("2026-09-10", new Map([["2026-09-10", record(10)]]));
    timeline.dispose();
    const before = [...dates.children];
    records.set("2026-09-10", record(20));
    recordForDate.mockClear(); onScroll.mockClear();
    timeline.refreshDates(["2026-09-10"], true);
    expect(dates.children).toEqual(before);
    expect(recordForDate).not.toHaveBeenCalled();
    expect(onScroll).not.toHaveBeenCalled();
  });
  it("observes only a replaced day, retaining size subscriptions for unchanged rows", () => {
    const { timeline, records } = fixture("2026-09-10", new Map([["2026-09-10", record(10)]]));
    observer.observe.mockClear(); observer.unobserve.mockClear(); observer.disconnect.mockClear();
    records.set("2026-09-10", record(20));
    timeline.refreshDates(["2026-09-10"], false);
    expect(observer.disconnect).not.toHaveBeenCalled();
    expect(observer.unobserve).toHaveBeenCalledTimes(1);
    expect(observer.observe).toHaveBeenCalledTimes(1);
    expect((observer.observe.mock.calls[0][0] as NodeStub).dataset.date).toBe("2026-09-10");
    observer.observe.mockClear(); observer.unobserve.mockClear();
    timeline.refreshDates(["2026-09-10"], false);
    expect(observer.observe).not.toHaveBeenCalled();
    expect(observer.unobserve).not.toHaveBeenCalled();
    timeline.dispose();
  });
  it("uses the cached viewport height throughout a scroll frame and snapshot", () => {
    const { timeline, dates } = fixture("2026-09-10");
    const height = dates.clientHeight;
    const read = vi.fn(() => height);
    Object.defineProperty(dates, "clientHeight", { get: read, configurable: true });
    dates.scrollTop += 12;
    dates.listeners.get("scroll")?.({} as Event); flush();
    expect(timeline.snapshot()).toEqual({ date: "2026-09-10", fraction: 0.5 });
    expect(read).not.toHaveBeenCalled();
    timeline.dispose();
  });
  it("publishes a scroll position only once and skips stationary note updates", () => {
    const { timeline, dates, onScroll, records } = fixture("2026-09-10", new Map([["2026-09-10", record(10)]]));
    onScroll.mockClear();
    dates.scrollTop += 12;
    dates.listeners.get("scroll")?.({} as Event); flush();
    dates.listeners.get("scrollend")?.({} as Event);
    expect(onScroll).toHaveBeenCalledTimes(1);
    records.set("2026-09-10", record(20));
    timeline.refreshDates(["2026-09-10"], false);
    layout.resize();
    expect(onScroll).toHaveBeenCalledTimes(1);
    timeline.dispose();
  });
  it("publishes a changed viewport midpoint even when its top date has not moved", () => {
    const { timeline, dates, onScroll } = fixture("2026-09-10");
    onScroll.mockClear();
    dates.clientHeight = 480; layout.resize();
    expect(onScroll).toHaveBeenCalledExactlyOnceWith({ date: "2026-09-10", fraction: 0 }, { year: 2026, month: 9, day: 20 });
    timeline.dispose();
  });
  it("keeps recurring grain continuous through fractional row heights, linked expansion, and folding", () => {
    layout.height = 24.75;
    const { timeline, dates, settings } = fixture("2026-09-19", new Map([["2026-09-19", record()], ["2026-09-20", record()]]), new Map(), null, "2026-09-25");
    settings.highlightedWeekdays = [6, 0];
    timeline.refreshDates(["2026-09-19", "2026-09-20"], false);
    const assertJoined = () => {
      let offset = 0;
      for (const row of dates.children) {
        if (row.hidden || row.classes.has("is-parked")) continue;
        if (row.classes.has("is-highlighted")) {
          expect(row.props["--daymark-grain-y"]).toBe(`${-offset}px`);
          offset += row.getBoundingClientRect().height;
        } else offset = 0;
      }
      const first = dates.children.find(row => row.dataset.date === "2026-09-19")!;
      const second = dates.children.find(row => row.dataset.date === "2026-09-20")!;
      expect(parseFloat(first.props["--daymark-grain-y"]) - parseFloat(second.props["--daymark-grain-y"]))
        .toBe(first.getBoundingClientRect().height);
    };
    assertJoined();
    const first = dates.children.find(row => row.dataset.date === "2026-09-19")!;
    first.changeLayout!(() => layout.extra.set("2026-09-19", 43.5));
    assertJoined();
    const fold = dates.children.find(row => row.dataset.fold === "2026-09-01")!;
    fold.foldToggle!(); assertJoined();
    fold.foldToggle!(); assertJoined();
    first.changeLayout!(() => layout.extra.delete("2026-09-19"));
    assertJoined();
    const paint = vi.spyOn(first.style, "setProperty");
    layout.resize();
    dates.scrollTop += 10;
    dates.listeners.get("scroll")?.({} as Event); flush();
    expect(paint).not.toHaveBeenCalled();
    timeline.dispose();
  });
  it("preserves the visible date when an earlier linked-note list expands and collapses", () => {
    const { timeline, dates } = fixture("2026-09-10");
    const earlier = dates.children.find(row => row.dataset.date === "2026-09-05")!;
    const top = dates.scrollTop;
    earlier.changeLayout!(() => layout.extra.set("2026-09-05", 72));
    expect(dates.scrollTop).toBe(top + 72);
    expect(timeline.snapshot()).toEqual({ date: "2026-09-10", fraction: 0 });
    earlier.changeLayout!(() => layout.extra.delete("2026-09-05"));
    expect(dates.scrollTop).toBe(top);
    timeline.dispose();
  });
  it("tracks fractions inside an expanded date without reading layout on scroll", () => {
    layout.extra.set("2026-09-10", 72);
    const { timeline, dates } = fixture("2026-09-10");
    const geometry = vi.spyOn(NodeStub.prototype, "getBoundingClientRect");
    dates.scrollTop += 48;
    dates.listeners.get("scroll")?.({} as Event); flush();
    expect(timeline.snapshot()).toEqual({ date: "2026-09-10", fraction: 0.5 });
    expect(geometry).not.toHaveBeenCalled();
    geometry.mockRestore(); timeline.dispose();
  });
  it("centers Today using expanded heights and follows the month at the actual midpoint", () => {
    layout.extra.set("2026-09-05", 300);
    layout.extra.set("2026-09-29", 240);
    const { timeline, dates, onScroll } = fixture("2026-09-20");
    const topFor = (iso: string) => {
      let top = 0;
      for (const row of dates.children) {
        if (row.dataset.date === iso) return top;
        top += row.getBoundingClientRect().height;
      }
      throw new Error("Date missing");
    };
    timeline.scrollToDate({ year: 2026, month: 9, day: 25 }, "center");
    expect(dates.scrollTop + dates.clientHeight / 2).toBe(topFor("2026-09-25") + 12);
    dates.scrollTop = topFor("2026-09-29");
    dates.listeners.get("scroll")?.({} as Event); flush();
    expect(onScroll.mock.lastCall?.[1]).toEqual({ year: 2026, month: 9, day: 29 });
    timeline.dispose();
  });
  it("restores the scroll anchor after observed editing or font-height changes", () => {
    const { timeline, dates } = fixture("2026-09-10");
    const top = dates.scrollTop;
    layout.extra.set("2026-09-05", 48); layout.resize();
    expect(dates.scrollTop).toBe(top + 48);
    expect(timeline.snapshot()).toEqual({ date: "2026-09-10", fraction: 0 });
    layout.extra.delete("2026-09-05"); layout.resize();
    expect(dates.scrollTop).toBe(top);
    timeline.dispose();
  });
  it("refreshes changed linked titles even when word totals are unchanged", () => {
    const { timeline, dates, records, state } = fixture("2026-09-10");
    state.lens = false;
    records.set("2026-09-10", { ...record(), linkedNotes: [{ path: "One.md", title: "One" }] });
    timeline.refreshDates(["2026-09-10"], false);
    const before = dates.children.find(row => row.dataset.date === "2026-09-10");
    records.set("2026-09-10", { ...record(), linkedNotes: [{ path: "Two.md", title: "Two" }] });
    timeline.refreshDates(["2026-09-10"], false);
    expect(dates.children.find(row => row.dataset.date === "2026-09-10")).not.toBe(before);
    timeline.dispose();
  });
  it("updates context-menu-only naming when links appear or disappear beneath a lens", () => {
    const { timeline, dates, records } = fixture("2026-09-10", new Map([["2026-09-10", record()]]));
    const row = () => dates.children.find(row => row.dataset.date === "2026-09-10");
    const original = row();
    records.set("2026-09-10", { ...record(), linkedNotes: [{ path: "One.md", title: "One" }] });
    timeline.refreshDates(["2026-09-10"], true);
    const linked = row();
    expect(linked).not.toBe(original);
    records.set("2026-09-10", { ...record(), linkedNotes: [{ path: "Two.md", title: "Two" }] });
    timeline.refreshDates(["2026-09-10"], true);
    expect(row()).toBe(linked);
    records.set("2026-09-10", record());
    timeline.refreshDates(["2026-09-10"], true);
    expect(row()).not.toBe(linked);
    timeline.dispose();
  });
  it("refreshes photo tooltip counts even when Standard note covers are disabled", () => {
    const { timeline, dates, settings, records } = fixture("2026-09-01", new Map([["2026-09-20", record(20, 1)]]));
    const before = [...dates.children];
    settings.showCoverPhotos = false;
    timeline.refreshDates(["2026-09-20"], false);
    expect(dates.children).toEqual(before);
    records.set("2026-09-20", record(20, 2));
    timeline.refreshDates(["2026-09-20"], false);
    expect(dates.children.filter(row => !before.includes(row)).map(row => row.dataset.date)).toEqual(["2026-09-20"]);
    timeline.dispose();
  });
  it("refreshes only the named day when adding, changing, or removing an emoji at a month boundary", () => {
    const records = new Map([["2026-09-30", record()], ["2026-10-01", record(12, 1)], ["2026-10-02", record()]]);
    const { timeline, dates, settings } = fixture("2026-09-01", records);
    const anchor = timeline.snapshot();
    let before = [...dates.children];
    settings.dayNames["2026-10-01"] = "🎬 Movie night";
    timeline.refreshDates(["2026-10-01"], false);
    expect(dates.children.filter(row => !before.includes(row)).map(row => row.dataset.date))
      .toEqual(["2026-10-01"]);
    before = [...dates.children];
    settings.dayNames["2026-10-01"] = "📖 Reading";
    timeline.refreshDates(["2026-10-01"], false);
    expect(dates.children.filter(row => !before.includes(row)).map(row => row.dataset.date)).toEqual(["2026-10-01"]);
    before = [...dates.children];
    delete settings.dayNames["2026-10-01"];
    timeline.refreshDates(["2026-10-01"], false);
    expect(dates.children.filter(row => !before.includes(row)).map(row => row.dataset.date))
      .toEqual(["2026-10-01"]);
    expect(timeline.snapshot()).toEqual(anchor);
    timeline.dispose();
  });
  it("restores an offscreen draft after a full reconstruction without loading intervening years", () => {
    const draft = { iso: "2000-01-01", value: "Unsaved", start: 2, end: 4 };
    const { timeline, dates, nameEditor } = fixture("2026-09-01", new Map(), new Map(), draft);
    expect(dates.children.length).toBeLessThan(200);
    expect(dates.children.find(row => row.dataset.date === draft.iso)!.classes.has("is-parked")).toBe(true);
    expect(nameEditor.draft).toBe(draft);
    timeline.dispose();
  });
  it("keeps identical rows and does no layout publication when values are unchanged", () => {
    const { timeline, dates, records, onScroll } = fixture("2026-09-01", new Map([["2026-09-20", record(10)]]));
    const before = [...dates.children];
    onScroll.mockClear();
    timeline.refreshDates(["2026-09-20"], true);
    expect(dates.children).toEqual(before);
    expect(onScroll).not.toHaveBeenCalled();
    records.set("2026-09-20", record(11));
    timeline.refreshDates(["2026-09-20"], false);
    expect(dates.children.filter(row => !before.includes(row)).map(row => row.dataset.date)).toEqual(["2026-09-20"]);
    timeline.dispose();
  });
  it("only redraws nonzero lens bars when the maximum changes", () => {
    const values = new Map([["2026-09-01", 4], ["2026-09-02", 0]]);
    const { timeline, dates, state } = fixture("2026-09-01", new Map(), values);
    const before = [...dates.children]; state.maximum = 20;
    timeline.refreshDates(["2026-09-30"], true);
    expect(dates.children.filter(row => !before.includes(row)).map(row => row.dataset.date)).toEqual(["2026-09-01"]);
    timeline.dispose();
  });
  it("updates day names and both Today positions without moving selection or scroll", () => {
    const { timeline, dates, state, settings } = fixture();
    state.todayIso = "2026-09-20"; timeline.refreshDates([state.todayIso], false);
    const before = [...dates.children]; const anchor = timeline.snapshot();
    state.todayIso = "2026-09-21";
    settings.dayNames["2026-09-22"] = "Named";
    timeline.refreshDates(["2026-09-20", "2026-09-21", "2026-09-22"], false);
    expect(dates.children.filter(row => row.dataset.date && !before.includes(row)).map(row => row.dataset.date)).toEqual(["2026-09-20", "2026-09-21", "2026-09-22"]);
    expect(timeline.snapshot()).toEqual(anchor); expect(state.selectedIso).toBe("");
    timeline.dispose();
  });
  it("postpones the pointer-release fallback while momentum scrolling continues", () => {
    const { timeline, dates, scroll } = fixture();
    const first = dates.children[0];
    dates.listeners.get("pointerdown")?.({} as Event);
    scroll("2026-11-20", 0, false);
    layout.windowListeners.get("pointerup")?.({} as Event);
    const releaseTimer = [...layout.timers.keys()][0];
    scroll("2026-11-21", 0, false);
    expect(layout.timers.has(releaseTimer)).toBe(false);
    expect(layout.timers.size).toBe(1);
    expect(dates.children[0]).toBe(first);
    dates.listeners.get("scrollend")?.({} as Event);
    expect(layout.timers.size).toBe(0);
    expect(dates.children[0]).not.toBe(first);
    timeline.dispose();
  });
  it("ignores changes outside the buffer without rereading its boundary dates", () => {
    const records = new Map([["2026-07-01", record()], ["2026-11-30", record()]]);
    const { timeline, dates, recordForDate } = fixture("2026-09-01", records);
    const rows = dates.children.filter(row => row.dataset.date);
    const before = addDays(parseIsoDate(rows[0].dataset.date)!, -1);
    const after = addDays(parseIsoDate(rows.at(-1)!.dataset.date)!, 1);
    records.set(toIsoDate(before), record(0, 1)); records.set(toIsoDate(after), record(0, 1));
    recordForDate.mockClear();
    timeline.refreshDates([toIsoDate(before), toIsoDate(after)], false);
    const changed = dates.children.filter(row => row.dataset.date && !rows.includes(row));
    expect(changed).toEqual([]);
    expect(recordForDate).not.toHaveBeenCalled();
    const unchanged = [...dates.children];
    timeline.refreshDates([toIsoDate(addDays(before, -1)), toIsoDate(addDays(after, 1))], false);
    expect(dates.children).toEqual(unchanged);
    timeline.dispose();
  });
  it("patches one edited date without reading neighbors or replacing other rows, labels, or an unrelated editor", () => {
    const records = new Map([["2026-09-19", record()], ["2026-09-21", record()]]);
    const { timeline, dates, nameEditor, recordForDate, scroll } = fixture("2026-09-01", records);
    scroll("2026-09-10", 0.5);
    nameEditor.draft = { iso: "2026-09-12", value: "Unsaved", start: 3, end: 3 };
    const before = [...dates.children];
    const anchor = timeline.snapshot();
    recordForDate.mockClear();
    records.set("2026-09-20", record(10, 1));
    timeline.refreshDates(["2026-09-20", "2026-09-20"], false);
    expect(dates.children.filter(row => !before.includes(row)).map(row => row.dataset.date))
      .toEqual(["2026-09-20"]);
    expect(recordForDate).toHaveBeenCalledTimes(1);
    expect(dates.children.find(row => row.dataset.date === "2026-09-12"))
      .toBe(before.find(row => row.dataset.date === "2026-09-12"));
    expect(timeline.snapshot()).toEqual(anchor);
    expect(dates.children.length).toBe(before.length);
    timeline.dispose();
  });
  it("refreshes a changed month's lens scale while retaining all other months", () => {
    const values = new Map(Array.from({ length: 30 }, (_, i) => [`2026-09-${String(i + 1).padStart(2, "0")}`, 1]));
    const records = new Map([["2026-10-01", record()]]);
    const { timeline, dates, state } = fixture("2026-09-01", records, values);
    const before = [...dates.children];
    state.maximum = 20;
    records.set("2026-09-30", record(10, 1));
    timeline.refreshDates(["2026-09-30"], true);
    const changed = dates.children.filter(row => !before.includes(row));
    expect(changed).toHaveLength(30);
    expect(changed[0].dataset.date).toBe("2026-09-01");
    expect(changed.at(-1)!.dataset.date).toBe("2026-09-30");
    expect(dates.children.find(row => row.dataset.month === "2026-10-01"))
      .toBe(before.find(row => row.dataset.month === "2026-10-01"));
    timeline.dispose();
  });
  it("does no record lookups for changed notes beyond the buffer and keeps replacement tab order correct", () => {
    const { timeline, dates, recordForDate } = fixture();
    recordForDate.mockClear();
    timeline.refreshDates(["2020-01-01"], false);
    expect(recordForDate).not.toHaveBeenCalled();
    timeline.refreshDates(["2026-09-01", "2026-08-01"], false);
    expect(dates.children.find(row => row.dataset.date === "2026-09-01")!.buttons[0].tabIndex).toBe(0);
    expect(dates.children.find(row => row.dataset.date === "2026-08-01")!.buttons[0].tabIndex).toBe(-1);
    timeline.dispose();
  });
  it("reads each displayed date once without fetching neighboring dates", () => {
    const { timeline, dates, recordForDate } = fixture();
    expect(recordForDate).toHaveBeenCalledTimes(dates.children.filter(row => row.dataset.date).length);
    timeline.dispose();
  });
  it("does no button traversal for scrolling within the same visible day range", () => {
    const { timeline, dates, scroll } = fixture();
    scroll("2026-09-10", 0.25);
    for (const row of dates.children) row.querySelectorAll.mockClear();
    scroll("2026-09-10", 0.5);
    expect(dates.children.reduce((total, row) => total + row.querySelectorAll.mock.calls.length, 0)).toBe(0);
    scroll("2026-09-11", 0.5);
    expect(dates.children.reduce((total, row) => total + row.querySelectorAll.mock.calls.length, 0)).toBe(2);
    timeline.dispose();
  });
  it("does not tab into a day below a visible month label", () => {
    const { timeline, dates, scroll } = fixture();
    dates.clientHeight = 48; layout.resize();
    scroll("2026-09-30");
    expect(dates.children.find(row => row.dataset.date === "2026-09-30")?.buttons[0].tabIndex).toBe(0);
    expect(dates.children.find(row => row.dataset.date === "2026-10-01")?.buttons[0].tabIndex).toBe(-1);
    timeline.dispose();
  });
  it("settles after release if native scrollend arrived while the pointer was held", () => {
    const { timeline, dates, scroll } = fixture();
    const first = dates.children[0];
    dates.listeners.get("pointerdown")?.({} as Event);
    scroll("2026-11-21");
    expect(dates.children[0]).toBe(first);
    layout.windowListeners.get("pointerup")?.({} as Event); idle();
    expect(dates.children[0]).not.toBe(first);
    expect(timeline.snapshot().date).toBe("2026-11-21");
    timeline.dispose();
  });
  it("rolls through a month boundary without replacing retained rows or selecting/creating a note", () => {
    const { timeline, dates, scroll, onSelect, onNameChange, onScroll } = fixture();
    const october = dates.children.find(row => row.dataset.date === "2026-10-01");
    scroll("2026-10-01", 0.375);
    expect(timeline.snapshot()).toEqual({ date: "2026-10-01", fraction: 0.375 });
    expect(dates.children.find(row => row.dataset.date === "2026-10-01")).toBe(october);
    expect(onScroll).toHaveBeenLastCalledWith({ date: "2026-10-01", fraction: 0.375 }, { year: 2026, month: 10, day: 6 });
    expect(onSelect).not.toHaveBeenCalled(); expect(onNameChange).not.toHaveBeenCalled();
    timeline.dispose();
  });
  it("prepends earlier dates without moving the visible date and keeps a bounded, gap-free window", () => {
    const { timeline, dates, scroll } = fixture();
    for (let month = 8; month >= 1; month--) {
      scroll(`2026-${String(month).padStart(2, "0")}-10`, 0.5);
      expect(timeline.snapshot().fraction).toBe(0.5);
      expect(dates.children.length).toBeLessThan(200);
      const days = dates.children.filter(row => row.dataset.date);
      for (let i = 1; i < days.length; i++) {
        expect(days[i].dataset.date).toBe(toIsoDate(addDays(parseIsoDate(days[i - 1].dataset.date)!, 1)));
      }
    }
    timeline.dispose();
  });
  it("handles leap February and December without blank padding, and uses each month's lens", () => {
    const { timeline, dates } = fixture("2028-02-28");
    const february = dates.children.filter(row => row.dataset.date?.startsWith("2028-02"));
    expect(february).toHaveLength(29);
    expect(february.at(-1)?.nextElementSibling?.dataset.month).toBe("2028-03-01");
    expect(february.at(-1)?.nextElementSibling?.nextElementSibling?.dataset).toEqual({ date: "2028-03-01", lens: "month-3" });
    timeline.scrollToDate({ year: 2027, month: 12, day: 31 }, "start");
    expect(timeline.snapshot().date).toBe("2027-12-31");
    expect(dates.children.find(row => row.dataset.date === "2027-12-31")?.nextElementSibling?.nextElementSibling?.dataset.date).toBe("2028-01-01");
    timeline.dispose();
  });
  it("keeps a fully visible selected date still; navigates to distant dates and month starts explicitly", () => {
    const { timeline, scroll } = fixture();
    scroll("2026-09-10", 0.25);
    timeline.scrollToDate({ year: 2026, month: 9, day: 15 });
    expect(timeline.snapshot()).toEqual({ date: "2026-09-10", fraction: 0.25 });
    timeline.scrollToDate({ year: 2030, month: 1, day: 20 });
    expect(timeline.snapshot().date).toBe("2030-01-20");
    timeline.scrollToDate({ year: 2030, month: 2, day: 1 }, "start");
    expect(timeline.snapshot().date).toBe("2030-02-01");
    timeline.dispose();
  });
  it.each([
    { target: "2026-09-05", height: 240, rowHeight: 24 },
    { target: "2026-10-01", height: 480, rowHeight: 24 },
    { target: "2030-01-01", height: 744, rowHeight: 24 },
    { target: "2026-09-25", height: 600, rowHeight: 44 },
    { target: "2026-09-25", height: 600, rowHeight: 38 },
    { target: "2026-10-01", height: 600, rowHeight: 56 },
    { target: "2028-02-29", height: 417, rowHeight: 29.5 }
  ])("centers $target in a $height px viewport, including unloaded months", ({ target, height, rowHeight }) => {
    const { timeline, dates, onSelect, onScroll } = fixture();
    dates.clientHeight = height; layout.height = rowHeight; layout.resize();
    timeline.scrollToDate(parseIsoDate(target)!, "center");
    const index = dates.children.findIndex(row => row.dataset.date === target);
    expect(index).toBeGreaterThanOrEqual(0);
    expect((index + 0.5) * rowHeight - dates.scrollTop).toBeCloseTo(height / 2);
    expect(onScroll).toHaveBeenLastCalledWith(timeline.snapshot(), parseIsoDate(target));
    const centered = timeline.snapshot();
    timeline.scrollToDate(parseIsoDate(target)!, "center");
    expect(timeline.snapshot()).toEqual(centered);
    expect(onSelect).not.toHaveBeenCalled();
    timeline.dispose();
  });
  it.each([32, 38, 44, 56])("preserves the date and partial-row offset at %s px row height", rowHeight => {
    const { timeline, scroll } = fixture();
    scroll("2026-09-21", 0.5);
    layout.height = rowHeight; layout.resize();
    expect(timeline.snapshot()).toEqual({ date: "2026-09-21", fraction: 0.5 });
    timeline.dispose();
  });
  it("keeps an active day-name editor mounted when trimming offscreen months", () => {
    const { timeline, dates, nameEditor } = fixture();
    const editing = dates.children.find(row => row.dataset.date === "2026-09-21");
    nameEditor.draft = { iso: "2026-09-21", value: "Unsaved", start: 7, end: 7 };
    timeline.scrollToDate({ year: 2037, month: 1, day: 1 }, "start");
    expect(dates.children.length).toBeLessThan(200);
    expect(dates.children.find(row => row.dataset.date === "2026-09-21")).toBe(editing);
    expect(editing!.classes.has("is-parked")).toBe(true);
    expect(nameEditor.draft).toEqual({ iso: "2026-09-21", value: "Unsaved", start: 7, end: 7 });
    timeline.scrollToDate({ year: 2026, month: 9, day: 21 }, "start");
    expect(editing!.classes.has("is-parked")).toBe(false);
    expect(dates.children.find(row => row.dataset.date === "2026-09-21")).toBe(editing);
    nameEditor.draft = null;
    timeline.scrollToDate({ year: 2027, month: 2, day: 1 }, "start");
    expect(dates.children.length).toBeLessThan(200);
    timeline.dispose();
  });
  it("restores the same date after a hidden sidebar loses its pixel scroll offset", () => {
    const { timeline, dates, scroll } = fixture();
    scroll("2026-09-21", 0.5);
    dates.clientHeight = 0; layout.resize(); dates.scrollTop = 0;
    expect(timeline.snapshot()).toEqual({ date: "2026-09-21", fraction: 0.5 });
    dates.clientHeight = 240; layout.resize();
    expect(timeline.snapshot()).toEqual({ date: "2026-09-21", fraction: 0.5 });
    timeline.dispose();
  });
  it("keeps offscreen buffered days out of Tab navigation", () => {
    const { timeline, dates, scroll } = fixture();
    scroll("2026-09-21");
    expect(dates.children.find(row => row.dataset.date === "2026-08-01")?.buttons[0].tabIndex).toBe(-1);
    expect(dates.children.find(row => row.dataset.date === "2026-09-21")?.buttons[0].tabIndex).toBe(0);
    expect(dates.children.find(row => row.dataset.date === "2026-10-10")?.buttons[0].tabIndex).toBe(-1);
    timeline.dispose();
  });
  it("keeps the scrollbar range and rows fixed throughout a drag, then preserves the released date", () => {
    const { timeline, dates, scroll } = fixture();
    const rows = [...dates.children];
    dates.listeners.get("pointerdown")?.({} as Event);
    scroll("2026-11-21", 0, false);
    expect(dates.children).toEqual(rows);
    expect(layout.timers.size).toBe(0); // Native scrollend waits for release, not an idle pause.
    dates.listeners.get("scrollend")?.({} as Event);
    expect(dates.children).toEqual(rows); // A held pointer still owns the range.
    layout.windowListeners.get("pointerup")?.({} as Event);
    dates.listeners.get("scrollend")?.({} as Event);
    expect(dates.children[0]).not.toBe(rows[0]);
    expect(timeline.snapshot()).toEqual({ date: "2026-11-21", fraction: 0 });
    expect(dates.children.length).toBeLessThan(200);
    timeline.dispose();
  });
  it("does not recycle the window just because the header crosses a month boundary", () => {
    const { timeline, dates, scroll } = fixture();
    const rows = [...dates.children];
    scroll("2026-10-01");
    expect(dates.children).toEqual(rows);
    timeline.dispose();
  });
  it("defers its older-browser fallback until a held pointer is released", () => {
    layout.nativeScrollEnd = false;
    const { timeline, dates, scroll } = fixture();
    const rows = [...dates.children];
    dates.listeners.get("pointerdown")?.({} as Event);
    scroll("2026-11-21", 0, false); idle();
    expect(dates.children).toEqual(rows);
    layout.windowListeners.get("pointerup")?.({} as Event); idle();
    expect(dates.children[0]).not.toBe(rows[0]);
    expect(timeline.snapshot().date).toBe("2026-11-21");
    scroll("2026-12-01", 0, false);
    timeline.dispose();
    expect(layout.timers.size).toBe(0);
    expect(layout.windowListeners.size).toBe(0);
  });
  it("keeps the scroll anchor stable when only pane height changes", () => {
    const { timeline, dates, scroll } = fixture();
    scroll("2026-09-21", 0.5);
    dates.clientHeight = 960; layout.resize();
    expect(timeline.snapshot()).toEqual({ date: "2026-09-21", fraction: 0.5 });
    timeline.dispose();
  });
  it("cancels pending scrolling and disconnects resize/listener work on close", () => {
    const { timeline, dates, onScroll } = fixture();
    dates.listeners.get("scroll")?.({} as Event);
    timeline.dispose(); const count = onScroll.mock.calls.length; flush();
    expect(layout.frames.size).toBe(0); expect(dates.listeners.size).toBe(0);
    expect(layout.windowListeners.size).toBe(0);
    expect(observer.disconnect).toHaveBeenCalled(); expect(onScroll).toHaveBeenCalledTimes(count);
  });
});

describe("saved scroll anchors", () => {
  it("rejects invalid dates and offsets rather than restoring invalid pixel positions", () => {
    for (const value of [null, {}, { date: "2026-02-30", fraction: 0 }, { date: "2026-09-01", fraction: NaN },
      { date: "2026-09-01", fraction: -1 }, { date: "2026-09-01", fraction: 1 }]) expect(normalizeMarginScroll(value)).toBeNull();
    expect(normalizeMarginScroll({ date: "2028-02-29", fraction: 0.25 })).toEqual({ date: "2028-02-29", fraction: 0.25 });
  });
  it("round trips a partially visible month label without jumping to day one", () => {
    const start = { year: 2026, month: 9, day: 1 };
    const anchor = { date: "2026-10-01", fraction: 0.4, monthLabel: true as const };
    const normalized = normalizeMarginScroll(anchor);
    expect(normalized).toEqual(anchor);
    const result = marginScrollAnchor(start, marginScrollOffset(start, anchor, 24), 24);
    expect(result.date).toBe(anchor.date);
    expect(result.monthLabel).toBe(true);
    expect(result.fraction).toBeCloseTo(0.4);
    expect(normalizeMarginScroll({ date: "2026-10-02", fraction: 0, monthLabel: true })).toBeNull();
  });
  it("round trips fractional rows across leap years", () => {
    const start = { year: 2027, month: 12, day: 1 };
    const anchor = { date: "2028-03-01", fraction: 0.3 };
    const result = marginScrollAnchor(start, marginScrollOffset(start, anchor, 25.5), 25.5);
    expect(result.date).toBe(anchor.date); expect(result.fraction).toBeCloseTo(anchor.fraction);
  });
});


describe("folded missing days", () => {
  const foldingFixture = (records = new Map<string, DailyRecord>(), selectedIso = "") =>
    fixture("2026-09-01", records, new Map(), null, "2026-09-25", selectedIso);
  const day = (dates: NodeStub, iso: string) => dates.children.find(row => row.dataset.date === iso)!;
  const stack = (dates: NodeStub, iso: string) => dates.children.find(row => row.dataset.fold === iso)!;

  it("folds past gaps but keeps blank existing notes, today, future and selection visible", () => {
    const { timeline, dates } = foldingFixture(new Map([["2026-09-10", record(0)]]), "2026-09-17");
    expect(stack(dates, "2026-09-01").dataset.end).toBe("2026-09-09");
    expect(day(dates, "2026-09-02").hidden).toBe(true);
    expect(day(dates, "2026-09-02").changeLayout).toBeUndefined(); // No controls/listeners until revealed.
    for (const iso of ["2026-09-10", "2026-09-17", "2026-09-25", "2026-09-26"]) expect(day(dates, iso).hidden).toBe(false);
    expect(stack(dates, "2026-09-18").dataset.end).toBe("2026-09-24");
    timeline.dispose();
  });

  it("unfolds and refolds through one persistent control without opening or creating notes", () => {
    const { timeline, dates, onSelect, onNameChange } = foldingFixture();
    const control = stack(dates, "2026-09-01");
    const before = timeline.snapshot();
    control.foldToggle!();
    expect(control.dataset.expanded).toBe("true");
    expect(day(dates, "2026-09-02").hidden).toBe(false);
    expect(day(dates, "2026-09-02").changeLayout).toBeTypeOf("function");
    expect(timeline.snapshot()).toEqual(before);
    timeline.refreshDates(["2026-09-03"], false);
    expect(stack(dates, "2026-09-01")).toBe(control);
    expect(control.dataset.expanded).toBe("true");
    control.foldToggle!();
    expect(control.dataset.expanded).toBe("false");
    expect(day(dates, "2026-09-02").hidden).toBe(true);
    expect(timeline.snapshot()).toEqual(before);
    expect(onSelect).not.toHaveBeenCalled(); expect(onNameChange).not.toHaveBeenCalled();
    timeline.dispose();
  });

  it("reveals new notes and custom names and splits the remaining gap without extra record reads", () => {
    const { timeline, dates, records, settings, recordForDate } = foldingFixture();
    records.set("2026-09-05", record(0));
    settings.dayNames["2026-09-12"] = "👋";
    recordForDate.mockClear();
    timeline.refreshDates(["2026-09-05", "2026-09-12"], false);
    expect(recordForDate).toHaveBeenCalledTimes(2);
    expect(day(dates, "2026-09-05").hidden).toBe(false);
    expect(day(dates, "2026-09-12").hidden).toBe(false);
    expect(stack(dates, "2026-09-01").dataset.end).toBe("2026-09-04");
    expect(stack(dates, "2026-09-06").dataset.end).toBe("2026-09-11");
    timeline.dispose();
  });

  it("reveals and centers a date inside a stack and keeps Today navigation unchanged", () => {
    const { timeline, dates, onSelect } = foldingFixture();
    for (const iso of ["2026-09-10", "2026-09-25", "2022-02-14"]) {
      timeline.scrollToDate(parseIsoDate(iso)!, "center");
      expect(day(dates, iso).hidden).toBe(false);
      let top = 0;
      for (const row of dates.children) { if (row.dataset.date === iso) break; top += row.getBoundingClientRect().height; }
      expect(dates.scrollTop + dates.clientHeight / 2).toBe(top + 12);
    }
    expect(onSelect).not.toHaveBeenCalled(); timeline.dispose();
  });

  it("fills the viewport and a buffer on both sides even through fully missing years", () => {
    const { timeline, dates, records } = foldingFixture();
    timeline.scrollToDate({ year: 2020, month: 6, day: 1 }, "start");
    const height = dates.children.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
    expect(dates.scrollTop).toBeGreaterThanOrEqual(dates.clientHeight);
    expect(height - dates.scrollTop).toBeGreaterThanOrEqual(dates.clientHeight * 2);
    expect(dates.children.filter(row => row.dataset.date).length).toBeLessThan(600);
    // Adding content before the viewport preserves the visible date/fraction.
    const before = timeline.snapshot();
    records.set("2020-05-15", record()); timeline.refreshDates(["2020-05-15"], false);
    expect(timeline.snapshot()).toEqual(before);
    timeline.dispose();
  });

  it("keeps hidden rows out of tab order and uses cached layout during scrolling", () => {
    const { timeline, dates } = foldingFixture();
    expect(day(dates, "2026-09-02").buttons[0].tabIndex).toBe(-1);
    const geometry = vi.spyOn(NodeStub.prototype, "getBoundingClientRect");
    dates.listeners.get("scroll")?.({} as Event); flush();
    expect(geometry).not.toHaveBeenCalled(); geometry.mockRestore(); timeline.dispose();
  });

  it("retains unfolded state after recycling months", () => {
    const { timeline, dates } = foldingFixture();
    stack(dates, "2026-09-01").foldToggle!();
    timeline.scrollToDate({ year: 2020, month: 1, day: 1 });
    dates.listeners.get("scrollend")?.({} as Event);
    timeline.scrollToDate({ year: 2026, month: 9, day: 25 }, "center");
    expect(stack(dates, "2026-09-01").dataset.expanded).toBe("true");
    expect(day(dates, "2026-09-02").hidden).toBe(false); timeline.dispose();
  });
  it("protects an active unnamed editor and retains open remnants after a note is added", () => {
    const { timeline, dates, records, nameEditor } = foldingFixture();
    stack(dates, "2026-09-01").foldToggle!();
    nameEditor.draft = { iso: "2026-09-10", value: "Unsaved", start: 7, end: 7 };
    records.set("2026-09-05", record(0));
    timeline.refreshDates(["2026-09-05"], false);
    expect(day(dates, "2026-09-10").hidden).toBe(false);
    expect(stack(dates, "2026-09-06").dataset.expanded).toBe("true");
    expect(stack(dates, "2026-09-11").dataset.expanded).toBe("true");
    expect(nameEditor.draft.value).toBe("Unsaved"); timeline.dispose();
  });

  it.each([-8, 0, 80, 210])("keeps the disclosure at its screen offset (%s px) through repeated toggles", screenOffset => {
    const { timeline, dates } = foldingFixture();
    const control = stack(dates, "2026-09-01");
    const position = () => {
      let top = 0;
      for (const row of dates.children) { if (row === control) return top; top += row.getBoundingClientRect().height; }
      throw new Error("Disclosure was removed");
    };
    dates.scrollTop = position() - screenOffset;
    for (let pass = 0; pass < 6; pass++) {
      control.foldToggle!();
      expect(position() - dates.scrollTop).toBe(screenOffset);
      expect(stack(dates, "2026-09-01")).toBe(control);
    }
    timeline.dispose();
  });

});
