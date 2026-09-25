import { addDays, compareDates, parseIsoDate, shiftAnchor, toDate, toIsoDate } from "./date";
import { createMarginDay, createMarginFold, createMarginMonthLabel, labelForReader, type MarginCalendarContext } from "./margin-calendar-view";
import { marginFolds, type MarginFold } from "./margin-folds";
import type { DailyRecord, PlainDate } from "./types";

export interface MarginScrollAnchor { date: string; fraction: number; monthLabel?: true; fold?: true }

export function normalizeMarginScroll(value: unknown): MarginScrollAnchor | null {
  if (!value || typeof value !== "object") return null;
  const { date, fraction, monthLabel, fold } = value as Partial<MarginScrollAnchor>;
  const parsed = typeof date === "string" ? parseIsoDate(date) : null;
  if (!parsed || typeof fraction !== "number" || !Number.isFinite(fraction) || fraction < 0 || fraction >= 1
    || (fold !== undefined && (fold !== true || monthLabel !== undefined))
    || (monthLabel !== undefined && (monthLabel !== true || parsed.day !== 1))) return null;
  return { date: date!, fraction, ...(monthLabel ? { monthLabel: true as const } : {}), ...(fold ? { fold: true as const } : {}) };
}

function monthStart(date: PlainDate): PlainDate { return { ...date, day: 1 }; }
function dayDistance(start: PlainDate, end: PlainDate): number {
  return Math.round((toDate(end).getTime() - toDate(start).getTime()) / 86400000);
}

/** Every month has one label row followed by its day rows. Start is a month start. */
export function marginScrollAnchor(start: PlainDate, scrollTop: number, rowHeight: number): MarginScrollAnchor {
  let position = Math.max(0, scrollTop) / rowHeight;
  let month = monthStart(start);
  while (true) {
    const next = shiftAnchor(month, "month", 1);
    const count = dayDistance(month, next) + 1;
    if (position + 0.00001 < count) break;
    position = Math.max(0, position - count);
    month = next;
  }
  const index = Math.floor(position + 0.00001);
  const fraction = Math.max(0, position - index);
  return index === 0 ? { date: toIsoDate(month), fraction, monthLabel: true }
    : { date: toIsoDate({ ...month, day: index }), fraction };
}

export function marginScrollOffset(start: PlainDate, anchor: MarginScrollAnchor, rowHeight: number): number {
  const date = parseIsoDate(anchor.date)!;
  const months = (date.year - start.year) * 12 + date.month - start.month;
  return (dayDistance(start, date) + months + (anchor.monthLabel ? 0 : 1) + anchor.fraction) * rowHeight;
}

export interface MarginTimelineOptions {
  anchor: MarginScrollAnchor;
  expandedFoldDates?: Set<string>;
  recordForDate: (date: PlainDate) => DailyRecord | null;
  contextForMonth: (month: PlainDate) => MarginCalendarContext;
  onScroll: (anchor: MarginScrollAnchor, focusDate: PlainDate) => void;
}

interface RowPosition { anchor: MarginScrollAnchor; top: number; height: number }
const rowInteractionEvents = ["pointerover", "pointerout", "focusin", "focusout", "keydown"];
function positionKey(anchor: MarginScrollAnchor): string { return `${anchor.monthLabel ? "m" : anchor.fold ? "f" : "d"}:${anchor.date}`; }

/** A bounded date window. Only offscreen rows change as a month passes the header. */
export class MarginTimeline {
  private readonly dates: HTMLElement;
  private readonly win: Window;
  private readonly observer: ResizeObserver;
  private readonly observed = new Set<HTMLElement>();
  private rows = new Map<string, HTMLElement>();
  private labels = new Map<string, HTMLElement>();
  private readonly rowKeys = new Map<string, string>();
  private readonly emptyDates = new Set<string>();
  private readonly deferredRows = new WeakSet<HTMLElement>();
  private readonly folds = new Map<string, { range: MarginFold; control: ReturnType<typeof createMarginFold> }>();
  private readonly collapsedDates = new Map<string, string>();
  private readonly expandedFoldDates: Set<string>;
  private revealedIso: string | null = null;
  private parkedIso: string | null = null;
  private readonly tabVisibility = new WeakMap<HTMLElement, boolean>();
  private start: PlainDate;
  private end: PlainDate;
  private anchor: MarginScrollAnchor;
  private rowHeight = 0;
  private viewportHeight = 0;
  private frame: number | null = null;
  private disposed = false;
  private readonly nativeScrollEnd: boolean;
  private settleTimer: number | null = null;
  private pointerDown = false;
  private positions: RowPosition[] = [];
  private positionByKey = new Map<string, RowPosition>();
  private published: { anchor: MarginScrollAnchor; focusIso: string } | null = null;

  constructor(parent: HTMLElement, private readonly options: MarginTimelineOptions) {
    this.expandedFoldDates = options.expandedFoldDates ?? new Set();
    this.anchor = options.anchor;
    this.start = this.end = parseIsoDate(this.anchor.date)!;
    const section = parent.createDiv("daymark-margin-section");
    const scroll = section.createDiv("daymark-margin-scroll");
    this.dates = scroll.createDiv("daymark-margin-dates");
    this.dates.setAttr("role", "group");
    this.dates.tabIndex = 0;
    this.nativeScrollEnd = "onscrollend" in this.dates;
    labelForReader(this.dates, "Daily notes timeline. Scroll to browse months.", scroll);
    this.win = parent.ownerDocument.defaultView!;
    for (const type of rowInteractionEvents) this.dates.addEventListener(type, this.rowInteraction);
    this.fillWindow(this.anchor);
    this.resize();
    this.dates.addEventListener("scroll", this.schedule, { passive: true });
    this.dates.addEventListener("scrollend", this.settle);
    this.dates.addEventListener("pointerdown", this.beginPointer, { passive: true });
    this.win.addEventListener("pointerup", this.endPointer, true);
    this.win.addEventListener("pointercancel", this.endPointer, true);
    this.win.addEventListener("blur", this.endPointer);
    // Observe the row as well: a theme/font change can change its minimum height.
    this.observer = new ResizeObserver(() => this.resize());
    this.observeSize();
    this.publish();
  }

  snapshot(): MarginScrollAnchor {
    return this.rowHeight > 0 && this.viewportHeight > 0 ? this.anchorAt(this.dates.scrollTop) : this.anchor;
  }

  refreshDates(dates: readonly string[], lensActive: boolean): void {
    if (this.disposed || dates.length === 0) return;
    this.anchor = this.snapshot();
    const affected = new Set(dates);
    const months = new Set(lensActive ? dates.map(iso => iso.slice(0, 7)) : []);
    let changed = false;
    // Ordinary edits touch only supplied dates. A lens can also change the scale
    // of other days in its month, so only that mode scans the loaded window.
    for (const iso of lensActive ? this.rows.keys() : affected) {
      const row = this.rows.get(iso);
      if (!row) continue;
      if (!affected.has(iso) && !months.has(iso.slice(0, 7))) continue;
      const date = parseIsoDate(iso)!;
      const context = this.options.contextForMonth(monthStart(date));
      this.preserveEditor(context, () => {
        const replacement = this.createDay(date, context, row);
        if (replacement === row) return;
        this.parkRow(replacement, iso === this.parkedIso, context.nameEditor.draft?.iso === iso);
        row.replaceWith(replacement);
        this.rows.set(iso, replacement);
        changed = true;
      });
    }
    if (changed) { this.syncFolds(); this.measure(); this.fillWindow(this.anchor); this.restore(); this.observeSize(); this.publish(); }
  }

  scrollToDate(date: PlainDate, align: "start" | "nearest" | "center" = "nearest"): void {
    const iso = toIsoDate(date);
    this.anchor = this.snapshot();
    this.revealedIso = iso;
    this.syncFolds();
    this.measure();
    this.observeSize();
    this.restore();
    if (align === "center" && this.rowHeight > 0 && this.dates.clientHeight > 0) {
      // Center the row itself, including when it is already visible or not loaded.
      const screens = Math.ceil(this.dates.clientHeight / this.rowHeight / 28) + 1;
      const start = shiftAnchor(monthStart(date), "month", -screens);
      const top = marginScrollOffset(start, { date: iso, fraction: 0 }, this.rowHeight);
      this.anchor = marginScrollAnchor(start, top - Math.max(0, (this.dates.clientHeight - this.rowHeight) / 2), this.rowHeight);
    } else if (align === "nearest" && this.rowHeight > 0 && this.rows.has(iso)) {
      const top = this.offsetFor({ date: iso, fraction: 0 });
      const bottom = top + (this.positionByKey.get(`d:${iso}`)?.height ?? this.rowHeight);
      if (top >= this.dates.scrollTop && bottom <= this.dates.scrollTop + this.dates.clientHeight) { this.publish(); return; }
      const offset = top < this.dates.scrollTop ? top : bottom - this.dates.clientHeight;
      this.anchor = this.anchorAt(offset);
    } else this.anchor = { date: iso, fraction: 0 };
    this.fillWindow(this.anchor);
    this.restore();
    if (align === "center" && this.rowHeight > 0) {
      this.dates.scrollTop = Math.max(0, this.offsetFor({ date: iso, fraction: 0 })
        - Math.max(0, (this.dates.clientHeight - (this.positionByKey.get(`d:${iso}`)?.height ?? this.rowHeight)) / 2));
    }
    this.publish();
  }

  dispose(): void {
    this.disposed = true;
    for (const type of rowInteractionEvents) this.dates.removeEventListener(type, this.rowInteraction);
    this.dates.removeEventListener("scroll", this.schedule);
    this.dates.removeEventListener("scrollend", this.settle);
    this.dates.removeEventListener("pointerdown", this.beginPointer);
    this.win.removeEventListener("pointerup", this.endPointer, true);
    this.win.removeEventListener("pointercancel", this.endPointer, true);
    this.win.removeEventListener("blur", this.endPointer);
    if (this.settleTimer !== null) this.win.clearTimeout(this.settleTimer);
    this.observer.disconnect();
    this.observed.clear();
    if (this.frame !== null) this.win.cancelAnimationFrame(this.frame);
    this.options.contextForMonth(monthStart(parseIsoDate(this.anchor.date)!)).nameEditor.menu?.hide();
  }

  private readonly beginPointer = (): void => { this.pointerDown = true; };
  private readonly endPointer = (): void => {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    this.deferSettle();
  };

  private deferSettle(): void {
    if (this.settleTimer !== null) this.win.clearTimeout(this.settleTimer);
    this.settleTimer = this.win.setTimeout(this.settle, 180);
  }

  private readonly settle = (): void => {
    if (this.settleTimer !== null) this.win.clearTimeout(this.settleTimer);
    this.settleTimer = null;
    if (this.disposed || this.pointerDown) return;
    this.anchor = this.snapshot();
    const first = parseIsoDate(this.anchor.date)!;
    const screen = Math.max(1, Math.ceil(this.dates.clientHeight / (this.rowHeight || 24)));
    // Keep the native scroll range fixed throughout dragging and momentum. Recycle
    // only once the gesture finishes, and only near the edges of the loaded dates.
    const last = this.positions[this.positions.length - 1];
    const nearEdge = this.folds.size > 0
      ? this.dates.scrollTop < this.dates.clientHeight || (last && last.top + last.height - this.dates.scrollTop < this.dates.clientHeight * 2)
      : dayDistance(this.start, first) < screen || dayDistance(first, this.end) < screen * 2;
    if (nearEdge) {
      if (this.fillWindow(this.anchor, true)) this.restore();
    }
    this.publish();
  };

  private readonly schedule = (): void => {
    if (this.disposed) return;
    if (!this.nativeScrollEnd || this.settleTimer !== null) this.deferSettle();
    if (this.frame !== null) return;
    this.frame = this.win.requestAnimationFrame(() => {
      this.frame = null;
      this.publish();
    });
  };

  private publish(): void {
    const top = this.dates.scrollTop;
    const height = this.viewportHeight;
    this.anchor = this.snapshot();
    const bottom = this.anchorAt(top + height - 0.001);
    const last = bottom.monthLabel ? toIsoDate(addDays(parseIsoDate(bottom.date)!, -1)) : bottom.date;
    for (const [iso, row] of this.rows) {
      // Tab enters visible dates, not the offscreen buffer preceding this month.
      const visible = !row.hidden && height > 0 && iso >= this.anchor.date && iso <= last;
      if (this.tabVisibility.get(row) === visible) continue;
      this.tabVisibility.set(row, visible);
      row.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.tabIndex = visible ? 0 : -1; });
    }
    for (const { range, control } of this.folds.values()) {
      const position = this.positionByKey.get(`f:${range.start}`);
      const tabIndex = height > 0 && position && position.top + position.height > top
        && position.top < top + height ? 0 : -1;
      if (control.button.tabIndex !== tabIndex) control.button.tabIndex = tabIndex;
    }
    const focusIso = height > 0 ? this.anchorAt(top + height / 2).date : this.anchor.date;
    const previous = this.published;
    if (previous?.focusIso === focusIso && positionKey(previous.anchor) === positionKey(this.anchor)
      && previous.anchor.fraction === this.anchor.fraction) return;
    this.published = { anchor: this.anchor, focusIso };
    this.options.onScroll(this.anchor, parseIsoDate(focusIso)!);
  }

  private restore(): void {
    if (this.rowHeight > 0) this.dates.scrollTop = this.offsetFor(this.anchor);
  }

  // Delegate row states once per timeline; no per-row listeners or layout reads.
  private readonly rowInteraction = (event: Event): void => {
    const key = event as KeyboardEvent;
    const keyboard = event.type === "keydown";
    if (keyboard && (key.altKey || key.ctrlKey || key.metaKey || key.key === "Shift")) return;
    const focus = keyboard || event.type.startsWith("focus");
    const control = (event.target as Element).closest(focus
      ? ".daymark-margin-date, .daymark-margin-name, .daymark-margin-lens-value"
      : ".daymark-margin-date, .daymark-margin-lens-value");
    if (!control || control.contains((event as FocusEvent).relatedTarget as Node | null)) return;
    control.closest<HTMLElement>(".daymark-margin-day")?.toggleClass(focus ? "has-keyboard-focus" : "is-hovered",
      focus ? keyboard || event.type === "focusin" && control.matches(":focus-visible") : event.type === "pointerover");
  };

  // Read layout only after content/size changes. Scroll events use this bounded
  // cache and binary search, including when a linked-note list expands a date.
  private measure(): boolean {
    const positions: RowPosition[] = [];
    const grain: { row: HTMLElement; y: string; start: boolean; end: boolean }[] = [];
    let grainOffset = 0;
    let top = 0;
    for (const child of Array.from(this.dates.children) as HTMLElement[]) {
      const date = child.dataset.date ?? child.dataset.month ?? child.dataset.fold;
      if (!date || child.hidden || child.dataset.date === this.parkedIso) continue;
      const height = child.getBoundingClientRect().height;
      if (height <= 0) continue;
      const anchor: MarginScrollAnchor = { date, fraction: 0, ...(child.dataset.month ? { monthLabel: true as const } : {}), ...(child.dataset.fold ? { fold: true as const } : {}) };
      positions.push({ anchor, top, height });
      if (child.classList.contains("is-highlighted")) {
        if (grainOffset) grain[grain.length - 1].end = false;
        grain.push({ row: child, y: `${-grainOffset}px`, start: grainOffset === 0, end: true });
        grainOffset += height;
      } else grainOffset = 0;
      top += height;
    }
    // Each recurring run shares a pattern origin, stable across month recycling
    // and linked-list expansion. Batch paint-only writes after layout reads.
    for (const { row, y, start, end } of grain) {
      for (const [key, value] of [["y", y], ["top", start ? "3px" : "0px"], ["bottom", end ? "3px" : "0px"]]) {
        const property = `--daymark-grain-${key}`;
        if (row.style.getPropertyValue(property) !== value) row.style.setProperty(property, value);
      }
    }
    const changed = positions.length !== this.positions.length || positions.some((position, index) => {
      const old = this.positions[index];
      return !old || positionKey(old.anchor) !== positionKey(position.anchor) || Math.abs(old.height - position.height) > 0.01;
    });
    this.positions = positions;
    this.positionByKey = new Map(positions.map(position => [positionKey(position.anchor), position]));
    return changed;
  }

  private anchorAt(offset: number): MarginScrollAnchor {
    if (!this.positions.length) return marginScrollAnchor(this.start, offset, this.rowHeight || 24);
    let low = 0, high = this.positions.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (this.positions[mid].top <= offset) low = mid; else high = mid - 1;
    }
    const position = this.positions[low];
    return { ...position.anchor, fraction: Math.max(0, Math.min(0.999999, (offset - position.top) / position.height)) };
  }

  private offsetFor(anchor: MarginScrollAnchor): number {
    const folded = !anchor.monthLabel && this.collapsedDates.get(anchor.date);
    const position = this.positionByKey.get(positionKey(anchor))
      ?? (folded ? this.positionByKey.get(`f:${folded}`) : this.positionByKey.get(`d:${anchor.date}`));
    return position ? position.top + anchor.fraction * position.height : marginScrollOffset(this.start, anchor, this.rowHeight || 24);
  }

  private changeLayout(change: () => void, pin?: string): void {
    const pinned = pin ? { date: pin, fraction: 0, fold: true as const } : null;
    const screenOffset = pinned ? this.offsetFor(pinned) - this.dates.scrollTop : 0;
    this.anchor = this.snapshot();
    change();
    this.measure();
    this.fillWindow(this.anchor);
    this.restore();
    // Keep the clicked disclosure under the pointer, even when the top anchor
    // belonged to dates that have just disappeared into this stack.
    if (pinned) this.dates.scrollTop = Math.max(0, this.offsetFor(pinned) - screenOffset);
    this.observeSize();
    this.publish();
  }

  private observeSize(): void {
    if (!this.observer) return;
    // Keep unchanged subscriptions: reconnecting every row delivers an initial
    // resize notification for each one, even when only one note changed.
    const next = new Set<HTMLElement>([this.dates]);
    const label = this.labels.values().next().value;
    if (label) next.add(label);
    for (const [iso, row] of this.rows) if (!row.hidden && iso !== this.parkedIso) next.add(row);
    for (const { control } of this.folds.values()) next.add(control.row);
    for (const element of this.observed) if (!next.has(element)) {
      this.observer.unobserve(element); this.observed.delete(element);
    }
    for (const element of next) if (!this.observed.has(element)) {
      this.observer.observe(element); this.observed.add(element);
    }
  }

  private resize(): void {
    if (this.disposed) return;
    // Keep the last date/fraction; old pixel offsets are invalid after font changes.
    const viewportHeight = this.dates.clientHeight;
    const resized = this.viewportHeight !== viewportHeight;
    this.viewportHeight = viewportHeight;
    if (viewportHeight <= 0) return;
    const row = this.labels.values().next().value;
    const height = row?.getBoundingClientRect().height ?? 0;
    if (height <= 0) return; // A hidden sidebar restores when it becomes visible.
    const changed = this.measure();
    if (resized || changed || Math.abs(height - this.rowHeight) > 0.01) {
      this.rowHeight = height;
      this.fillWindow(this.anchor);
      this.restore();
      this.publish();
    }
  }

  private fillWindow(anchor: MarginScrollAnchor, recycle = false): boolean {
    const date = parseIsoDate(anchor.date)!;
    let start = shiftAnchor(monthStart(date), "month", -2);
    const viewportHeight = this.dates.clientHeight;
    const visibleDays = Math.ceil(viewportHeight / (this.rowHeight || 24));
    let end = shiftAnchor(monthStart(addDays(date, visibleDays)), "month", 3);
    if (!recycle && compareDates(date, this.start) >= 0 && compareDates(date, this.end) < 0) {
      if (compareDates(this.start, start) < 0) start = this.start;
      if (compareDates(this.end, end) > 0) end = this.end;
    }
    let changed = this.loadWindow(start, end, anchor);
    // A folded month can be only two rows tall. Fill a measured buffer on both
    // sides instead of assuming that a fixed number of dates fills the viewport.
    for (let attempt = 0; attempt < 3 && this.folds.size > 0 && viewportHeight > 0; attempt++) {
      const top = this.offsetFor(anchor);
      const last = this.positions[this.positions.length - 1];
      const total = last ? last.top + last.height : 0;
      const labelHeight = this.rowHeight || this.positions.find(position => position.anchor.monthLabel)?.height || 24;
      let minimumFold = Infinity;
      for (const position of this.positions) if (position.anchor.fold) minimumFold = Math.min(minimumFold, position.height);
      const minimumMonth = labelHeight + minimumFold;
      const before = Math.max(0, Math.ceil((viewportHeight - top) / minimumMonth));
      const after = Math.max(0, Math.ceil((viewportHeight * 2 - (total - top)) / minimumMonth));
      if (!before && !after) break;
      start = shiftAnchor(start, "month", -before);
      end = shiftAnchor(end, "month", after);
      changed = this.loadWindow(start, end, anchor) || changed;
    }
    return changed;
  }

  private loadWindow(start: PlainDate, end: PlainDate, anchor: MarginScrollAnchor): boolean {
    const date = parseIsoDate(anchor.date)!;
    const editorContext = this.options.contextForMonth(monthStart(date));
    const draft = editorContext.nameEditor.draft;
    const parkedIso = draft && (draft.iso < toIsoDate(start) || draft.iso >= toIsoDate(end)) ? draft.iso : null;
    if (toIsoDate(start) === toIsoDate(this.start) && toIsoDate(end) === toIsoDate(this.end)
      && parkedIso === this.parkedIso) return false;
    this.preserveEditor(editorContext, () => {
      const nextRows = new Map<string, HTMLElement>();
      const nextLabels = new Map<string, HTMLElement>();
      const order: HTMLElement[] = [];
      let context = this.options.contextForMonth(start);
      for (let cursor = start; compareDates(cursor, end) < 0; cursor = addDays(cursor, 1)) {
        if (cursor.day === 1) context = this.options.contextForMonth(cursor);
        const iso = toIsoDate(cursor);
        if (cursor.day === 1) {
          const label = this.labels.get(iso) ?? createMarginMonthLabel(this.dates, cursor, context.locale);
          nextLabels.set(iso, label);
          order.push(label);
        }
        const row = this.rows.get(iso) ?? this.createDay(cursor, context);
        nextRows.set(iso, row);
        order.push(row);
      }
      // Keep only the editor itself, not every intervening month. Its input, draft
      // and caret survive recycling without saving merely because the user scrolled.
      const parkedDate = parkedIso ? parseIsoDate(parkedIso)! : null;
      const parked = parkedDate && (this.rows.get(parkedIso!) ?? this.createDay(parkedDate,
        this.options.contextForMonth(monthStart(parkedDate))));
      if (parked) { nextRows.set(parkedIso!, parked); order.push(parked); }
      for (const [iso, row] of nextRows) this.parkRow(row, iso === parkedIso, draft?.iso === iso);
      for (const [iso, row] of this.rows) if (!nextRows.has(iso)) { row.remove(); this.rowKeys.delete(iso); this.emptyDates.delete(iso); }
      for (const [iso, label] of this.labels) if (!nextLabels.has(iso)) label.remove();
      let next = this.dates.firstElementChild;
      for (const row of order) {
        if (row !== next) this.dates.insertBefore(row, next);
        next = row.nextElementSibling;
      }
      this.rows = nextRows;
      this.labels = nextLabels;
      this.start = start;
      this.end = end;
      this.parkedIso = parkedIso;
    });
    this.syncFolds();
    this.measure();
    this.observeSize();
    return true;
  }

  private syncFolds(): void {
    const context = this.options.contextForMonth(monthStart(parseIsoDate(this.anchor.date)!));
    const active = this.dates.ownerDocument.activeElement as HTMLElement | null;
    const focusedDate = active?.closest<HTMLElement>(".daymark-margin-day")?.dataset.date;
    const focusedFold = active?.closest<HTMLElement>(".daymark-margin-fold")?.dataset.fold;
    const ranges = marginFolds(this.rows.keys(), iso => this.emptyDates.has(iso)
      && iso < context.todayIso && iso !== context.selectedIso && iso !== this.revealedIso
      && iso !== context.nameEditor.draft?.iso && iso !== focusedDate && iso !== this.parkedIso);
    const keys = new Set(ranges.map(range => `${range.start}:${range.end}`));
    let lostFocus = false;
    for (const [key, fold] of this.folds) if (!keys.has(key)) {
      lostFocus ||= fold.range.start === focusedFold;
      fold.control.row.remove(); this.folds.delete(key);
    }
    this.collapsedDates.clear();
    for (const range of ranges) {
      const key = `${range.start}:${range.end}`;
      let fold = this.folds.get(key);
      if (!fold) {
        const control = createMarginFold(this.dates, range, context.locale, () => {
          this.changeLayout(() => {
            const expanded = range.dates.some(iso => this.expandedFoldDates.has(iso));
            for (const iso of range.dates) {
              if (expanded) this.expandedFoldDates.delete(iso); else this.expandedFoldDates.add(iso);
            }
            this.syncFolds();
          }, range.start);
        });
        fold = { range, control }; this.folds.set(key, fold);
      }
      const expanded = range.dates.some(iso => this.expandedFoldDates.has(iso));
      fold.control.update(expanded);
      const first = this.rows.get(range.start)!;
      if (fold.control.row.nextElementSibling !== first) this.dates.insertBefore(fold.control.row, first);
      if (!expanded) for (const iso of range.dates) this.collapsedDates.set(iso, range.start);
    }
    for (const [iso, row] of this.rows) {
      const hidden = this.collapsedDates.has(iso);
      if (row.hidden !== hidden) row.hidden = hidden;
      if (!row.hidden && this.deferredRows.has(row)) {
        const date = parseIsoDate(iso)!;
        const context = this.options.contextForMonth(monthStart(date));
        const replacement = createMarginDay(this.dates, date, null, { ...context, onLayoutChange: change => this.changeLayout(change) });
        row.replaceWith(replacement); this.rows.set(iso, replacement);
      }
    }
    if (focusedFold && active?.isConnected && this.dates.contains(active)) active.focus({ preventScroll: true });
    if (lostFocus && focusedFold) {
      const replacement = [...this.folds.values()].find(fold => fold.range.start <= focusedFold && fold.range.end >= focusedFold);
      (replacement?.control.button ?? this.rows.get(focusedFold)?.querySelector<HTMLButtonElement>(".daymark-margin-date"))?.focus({ preventScroll: true });
    }
  }

  private parkRow(row: HTMLElement, parked: boolean, editing: boolean): void {
    row.toggleClass("is-parked", parked);
    if (editing) {
      const input = row.querySelector<HTMLInputElement>(".daymark-margin-name-input");
      if (input) input.tabIndex = parked ? -1 : 0;
    }
  }

  private preserveEditor(context: MarginCalendarContext, mutate: () => void): void {
    const active = this.dates.ownerDocument.activeElement as HTMLElement | null;
    const editing = context.nameEditor.draft !== null;
    context.nameEditor.moving = editing;
    try { mutate(); } finally { context.nameEditor.moving = false; }
    if (editing && active?.isConnected && this.dates.contains(active)) active.focus({ preventScroll: true });
  }

  private createDay(date: PlainDate, context: MarginCalendarContext, existing?: HTMLElement): HTMLElement {
    const iso = toIsoDate(date);
    const record = this.options.recordForDate(date);
    if (record === null && !context.settings.dayNames[iso]?.trim()) this.emptyDates.add(iso);
    else this.emptyDates.delete(iso);
    const value = context.lens?.values.get(iso);
    const key = JSON.stringify([
      record !== null, record?.words, record?.linkedWords ?? 0, (record?.linkedWords ?? 0) > 0 ? record?.linkedNoteCount : 0,
      record?.linkedWritingStatus, record?.photos, context.settings.dayNames[iso],
      Boolean(record?.linkedNotes?.length), context.lens ? null : record?.linkedNotes,
      iso === context.todayIso, iso === context.selectedIso, context.locale,
      context.settings.highlightedWeekdays, context.lens?.id, context.lens?.label,
      value, value !== undefined && value > 0 ? context.lens?.maximum : null
    ]);
    if (existing && this.rowKeys.get(iso) === key) return existing;
    this.rowKeys.set(iso, key);
    // Missing dates need only a lightweight slot until their stack is opened.
    // Eligibility already used the index result; revealing them needs no reread.
    if (!existing && this.emptyDates.has(iso) && iso < context.todayIso
      && iso !== context.selectedIso && iso !== context.nameEditor.draft?.iso) {
      const row = this.dates.createDiv("daymark-margin-day");
      row.dataset.date = iso; this.deferredRows.add(row);
      return row;
    }
    return createMarginDay(this.dates, date, record, { ...context, onLayoutChange: change => this.changeLayout(change) });
  }
}
