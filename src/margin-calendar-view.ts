import { Menu, Notice, setIcon, setTooltip, type TooltipOptions } from "obsidian";
import { parseIsoDate, toDate, toIsoDate } from "./date";
import { dateTimeFormatter, numberFormatter } from "./intl-cache";
import { marginWireStyle, marginWritingCoil, marginWritingWords } from "./margin-calendar";
import { normalizeDayName, splitDayName } from "./day-names";
import type { MarginFold } from "./margin-folds";
import type { MarginTallyLens } from "./margin-tally";
import type { DailyRecord, DaymarkSettings, LinkedNote, PlainDate, Weekday } from "./types";

let labelSequence = 0;
const tooltipOptions: TooltipOptions = {
  classes: ["daymark-margin-tooltip"], delay: 650, placement: "bottom", gap: 5
};

export function labelForReader(element: HTMLElement, text: string, parent = element): void {
  // Obsidian uses aria-label for hover text; keep the full reader name separate.
  const label = parent.createSpan({ cls: "daymark-visually-hidden", text });
  label.id = `daymark-margin-label-${++labelSequence}`;
  element.setAttr("aria-labelledby", label.id);
}

export interface MarginNameEditor {
  menu?: Menu;
  moving?: boolean;
  draft: { iso: string; value: string; start: number | null; end: number | null } | null;
}

export interface MarginCalendarContext {
  locale: string;
  settings: DaymarkSettings;
  selectedIso: string;
  todayIso: string;
  onSelect: (date: PlainDate) => void;
  nameEditor: MarginNameEditor;
  onNameChange: (iso: string, name: string) => Promise<void>;
  lens?: MarginTallyLens | null;
  wireSeed?: number;
  expandedLinks?: Set<string>;
  onOpenLinkedNote?: (path: string, newLeaf: boolean) => Promise<void>;
  onLayoutChange?: (change: () => void) => void;
}

export interface MarginNavigation {
  onToday: () => void;
}

/** Preserve keyboard focus when saved names or index updates redraw Margin. */
export function captureMarginFocus(parent: HTMLElement): () => void {
  const active = parent.ownerDocument.activeElement;
  if (!active || !parent.contains(active)) return () => undefined;
  const tallyFocus = active.getAttribute("data-margin-focus");
  if (tallyFocus) return () => {
    const candidates = parent.querySelectorAll<HTMLElement>("[data-margin-focus]");
    Array.from(candidates).find(element => element.dataset.marginFocus === tallyFocus)?.focus({ preventScroll: true });
  };
  const row = active.closest<HTMLElement>(".daymark-margin-day");
  const iso = row?.dataset.date;
  const className = ["daymark-margin-date", "daymark-margin-name", "daymark-margin-today", "daymark-margin-lens-value"]
    .find(name => active.classList.contains(name));
  if (!className) return () => undefined;
  return () => parent.querySelector<HTMLElement>(
    `${iso ? `[data-date="${iso}"] ` : ""}.${className}`
  )?.focus({ preventScroll: true });
}

export function createMarginHeader(
  parent: HTMLElement,
  month: PlainDate,
  locale: string,
  navigation: MarginNavigation
): HTMLElement {
  const header = parent.createDiv("daymark-margin-header");
  header.createDiv("daymark-margin-period");
  updateMarginHeader(parent, month, locale);
  const actions = header.createDiv("daymark-margin-actions");
  const today = actions.createEl("button", { cls: "daymark-margin-today" });
  today.type = "button";
  setTooltip(today, "Go to today", tooltipOptions);
  setIcon(today.createSpan("daymark-margin-header-chip"), "locate-fixed");
  today.addEventListener("click", navigation.onToday);
  return actions.createDiv("daymark-margin-tally-slot");
}

/** Update the sticky month without replacing its navigation controls. */
export function updateMarginHeader(parent: HTMLElement, month: PlainDate, locale: string): void {
  const title = parent.querySelector<HTMLElement>(".daymark-margin-period");
  if (!title) return;
  const period = `${locale}:${month.year}-${month.month}`;
  if (title.dataset.period === period) return;
  title.dataset.period = period;
  title.replaceChildren();
  const date = toDate(month);
  const name = title.createSpan("daymark-margin-month");
  for (const length of ["long", "short"] as const) {
    name.createSpan({
      cls: `daymark-margin-month-${length}`,
      text: dateTimeFormatter(locale, { month: length, timeZone: "UTC" }).format(date)
    });
  }
  title.createSpan({ cls: "daymark-margin-year", text: String(month.year) });
  labelForReader(title, `${dateTimeFormatter(locale, {
    month: "long", year: "numeric", timeZone: "UTC"
  }).format(date)}`);
}

function setClippedNameHint(element: HTMLElement, name: string): void {
  const options: TooltipOptions = {
    ...tooltipOptions, classes: [...(tooltipOptions.classes ?? []), "daymark-margin-name-tooltip"]
  };
  const updateHint = (): void => {
    const clipped = element.clientWidth > 0 && element.scrollWidth > element.clientWidth;
    setTooltip(element, clipped ? name : "", options);
  };
  // Measure on entry, before Obsidian's delegated hover handler; no observer.
  setTooltip(element, "", options);
  element.addEventListener("mouseover", updateHint);
  element.addEventListener("focus", updateHint);
  element.addEventListener("mouseleave", () => setTooltip(element, "", options));
}

function createDayName(
  row: HTMLElement, main: HTMLElement, iso: string, fullDate: string, context: MarginCalendarContext,
  contextMenuOnly: boolean,
  updateMark: (name: string, editing?: boolean) => string
): void {
  const slot = main.createDiv("daymark-margin-name-slot");
  const today = iso === context.todayIso;
  let savedName = context.settings.dayNames[iso] ?? "";
  const showButton = (): HTMLButtonElement => {
    slot.replaceChildren();
    row.toggleClass("is-editing", false);
    const nameText = updateMark(savedName);
    const displayName = savedName ? nameText : today ? "Today" : "";
    row.toggleClass("is-unnamed", !displayName);
    if (contextMenuOnly) {
      if (displayName) {
        const name = slot.createSpan("daymark-margin-name is-readonly");
        const text = name.createSpan({ cls: "daymark-margin-name-text", text: displayName });
        if (savedName) setClippedNameHint(text, displayName);
      }
      return row.querySelector<HTMLButtonElement>(".daymark-margin-date")!;
    }
    const button = slot.createEl("button", { cls: "daymark-margin-name", text: displayName });
    button.type = "button";
    button.tabIndex = row.querySelector<HTMLButtonElement>(".daymark-margin-date")?.tabIndex ?? 0;
    button.toggleClass("is-empty", !displayName);
    if (!displayName) {
      const icon = button.createSpan("daymark-margin-name-icon");
      icon.setAttr("aria-hidden", "true");
      setIcon(icon, "pencil");
      setTooltip(button, savedName ? "Rename day" : "Name day", tooltipOptions);
    }
    labelForReader(button, `${today ? "Today. " : ""}${savedName ? `Edit day name: ${savedName}` : today ? "Rename day" : "Name day"}. ${fullDate}`);
    if (savedName && displayName) setClippedNameHint(button, displayName);
    button.addEventListener("click", () => edit());
    return button;
  };
  const edit = (): void => {
    updateMark(savedName, true);
    if (context.nameEditor.draft?.iso !== iso) {
      context.nameEditor.draft = { iso, value: savedName, start: 0, end: savedName.length };
    }
    const draft = context.nameEditor.draft;
    slot.replaceChildren();
    row.toggleClass("is-editing", true);
    const input = slot.createEl("input", { cls: "daymark-margin-name-input" });
    input.type = "text";
    input.value = draft.value;
    if (today) input.placeholder = "Today";
    labelForReader(input, `Name for ${fullDate}`, slot);
    let finished = false;
    const remember = (): void => {
      draft.value = input.value;
      draft.start = input.selectionStart;
      draft.end = input.selectionEnd;
    };
    const finish = (save: boolean, restoreFocus = false): void => {
      if (finished) return;
      finished = true;
      if (context.nameEditor.draft === draft) context.nameEditor.draft = null;
      const value = normalizeDayName(input.value);
      const oldName = savedName;
      if (save) savedName = value;
      const button = showButton();
      if (restoreFocus) button.focus({ preventScroll: true });
      if (save && value !== oldName) {
        void context.onNameChange(iso, value).catch(() => {
          new Notice("Could not save the day name. Please try again.");
          savedName = oldName;
          if (row.isConnected && !context.nameEditor.draft) {
            context.nameEditor.draft = { iso, value, start: 0, end: value.length };
            edit();
          }
        });
      }
    };
    input.addEventListener("input", remember);
    input.addEventListener("select", remember);
    input.addEventListener("keyup", remember);
    input.addEventListener("click", remember);
    input.addEventListener("blur", () => { if (!context.nameEditor.moving) finish(true); });
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(event.key === "Enter", true);
      }
    });
    queueMicrotask(() => {
      if (!input.isConnected || context.nameEditor.draft !== draft) return;
      input.focus({ preventScroll: true });
      input.setSelectionRange(draft.start, draft.end);
    });
  };
  const showNameMenu = (event?: MouseEvent): void => {
    context.nameEditor.menu?.hide();
    const menu = new Menu().setParentElement(row);
    context.nameEditor.menu = menu;
    menu.onHide(() => {
      if (context.nameEditor.menu === menu) delete context.nameEditor.menu;
    });
    menu.addItem(item => item.setTitle(savedName || today ? "Rename day" : "Name day")
      .setIcon("pencil").onClick(() => edit()));
    if (savedName) {
      menu.addItem(item => item.setTitle("Clear name").setIcon("x").onClick(() => {
        const oldName = savedName;
        savedName = "";
        showButton().focus({ preventScroll: true });
        void context.onNameChange(iso, "").catch(() => {
          new Notice("Could not clear the day name. Please try again.");
          savedName = oldName;
          if (row.isConnected && context.nameEditor.draft?.iso !== iso) showButton();
        });
      }));
    }
    if (event) menu.showAtMouseEvent(event);
    else {
      const bounds = row.getBoundingClientRect();
      menu.showAtPosition({ x: bounds.left, y: bounds.bottom }, row.ownerDocument);
    }
  };
  row.addEventListener("contextmenu", (event) => {
    // Keep native cut/copy/paste available inside the active text field.
    if (context.nameEditor.draft?.iso === iso) return;
    event.preventDefault();
    event.stopPropagation();
    showNameMenu(event);
  });
  row.addEventListener("keydown", (event) => {
    if (event.isComposing || context.nameEditor.draft?.iso === iso) return;
    if (event.key === "F2" && !contextMenuOnly) {
      event.preventDefault();
      event.stopPropagation();
      edit();
    } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      event.stopPropagation();
      showNameMenu();
    }
  });
  if (context.nameEditor.draft?.iso === iso) edit();
  else showButton();
}

function createLinkedNotes(row: HTMLElement, main: HTMLElement, details: HTMLElement, iso: string,
  notes: readonly LinkedNote[], context: MarginCalendarContext): void {
  if (!notes.length || context.lens) return;
  row.toggleClass("has-linked-notes", true);
  const preview = main.createDiv("daymark-margin-linked-preview");
  const openButton = (parent: HTMLElement, note: LinkedNote, cls: string): HTMLButtonElement => {
    const button = parent.createEl("button", { cls });
    button.type = "button";
    button.dataset.marginFocus = `linked:${iso}:${note.path}`;
    button.createSpan({ cls: "daymark-margin-linked-title", text: note.title });
    labelForReader(button, `Open linked note: ${note.title}`);
    const folder = note.path.slice(0, note.path.lastIndexOf("/") + 1);
    setTooltip(button, folder ? `${note.title}\n${folder}` : note.title, {
      ...tooltipOptions, classes: ["daymark-margin-tooltip", "daymark-margin-linked-tooltip"]
    });
    button.addEventListener("click", event => {
      event.stopPropagation();
      void context.onOpenLinkedNote?.(note.path, Boolean(event.ctrlKey || event.metaKey)).catch(() => {
        new Notice("Could not open this linked note. Please try again.");
      });
    });
    return button;
  };
  openButton(preview, notes[0], "daymark-margin-linked-first");
  if (notes.length === 1) { context.expandedLinks?.delete(iso); return; }
  const expanded = context.expandedLinks ?? new Set<string>();
  const more = preview.createEl("button", { cls: "daymark-margin-linked-more" });
  more.type = "button";
  more.dataset.marginFocus = `linked-more:${iso}`;
  more.createSpan({ text: numberFormatter(context.locale, { maximumFractionDigits: 0 }).format(notes.length) });
  const icon = more.createSpan("daymark-margin-linked-chevron");
  icon.setAttr("aria-hidden", "true");
  setIcon(icon, "chevron-down");
  const list = details.createDiv("daymark-margin-linked-list");
  list.id = `daymark-linked-${++labelSequence}`;
  more.setAttr("aria-controls", list.id);
  let populated = false;
  const sync = (): void => {
    const open = expanded.has(iso);
    if (open && !populated) {
      for (const note of notes.slice(1)) openButton(list, note, "daymark-margin-linked-note");
      populated = true;
    }
    list.hidden = !open;
    more.setAttr("aria-expanded", String(open));
    more.setAttr("aria-label", `${notes.length} linked notes. ${open ? "Hide" : "Show"} ${notes.length - 1} additional ${notes.length === 2 ? "note" : "notes"}`);
  };
  sync();
  more.addEventListener("click", event => {
    event.stopPropagation();
    const change = (): void => {
      if (expanded.has(iso)) expanded.delete(iso); else expanded.add(iso);
      sync();
    };
    if (context.onLayoutChange) context.onLayoutChange(change); else change();
  });
}

export function createMarginDay(
  parent: HTMLElement,
  date: PlainDate,
  record: DailyRecord | null,
  context: MarginCalendarContext
): HTMLDivElement {
  context.nameEditor.menu?.hide();
  const iso = toIsoDate(date);
  const selected = iso === context.selectedIso;
  const today = iso === context.todayIso;
  const contextMenuOnly = Boolean(record?.linkedNotes?.length);
  const row = parent.createDiv("daymark-margin-day");
  row.dataset.date = iso;
  row.toggleClass("has-note", record !== null);
  row.toggleClass("is-writing-pending", Boolean(record?.linkedWritingStatus));
  if (record?.linkedWritingStatus === "loading") row.setAttr("aria-busy", "true");
  row.toggleClass("is-selected", selected);
  row.toggleClass("is-today", today);
  const weekdayIndex = toDate(date).getUTCDay() as Weekday;
  const highlighted = context.settings.highlightedWeekdays.includes(weekdayIndex);
  row.toggleClass("is-highlighted", highlighted);
  if (highlighted) {
    row.createDiv("daymark-margin-recurring").setAttr("aria-hidden", "true");
  }
  const button = row.createEl("button", { cls: "daymark-margin-date" });
  button.type = "button";
  button.setAttr("aria-pressed", String(selected));
  if (!contextMenuOnly) button.setAttr("aria-keyshortcuts", "F2");
  if (today) button.setAttr("aria-current", "date");
  const fullDate = dateTimeFormatter(context.locale, { dateStyle: "full", timeZone: "UTC" }).format(toDate(date));
  const action = record ? "Open daily note." : "No daily note; select to confirm creation.";
  const format = numberFormatter(context.locale, { maximumFractionDigits: 2 });
  const writing = record?.linkedWritingStatus
    ? `${format.format(marginWritingWords(record))} known words · ${record.linkedWritingStatus === "loading" ? "Linked writing loading…" : "Some linked writing unavailable"}`
    : record
    ? `${format.format(marginWritingWords(record))} words${record.linkedNoteCount && (record.linkedWords ?? 0) > 0 ? ` · ${format.format(record.words)} here + ${format.format(record.linkedWords ?? 0)} in ${record.linkedNoteCount} linked ${record.linkedNoteCount === 1 ? "note" : "notes"}` : ""}`
    : "";
  const detail = writing + (record?.photos ? ` · ${format.format(record.photos)} ${record.photos === 1 ? "photo" : "photos"}` : "");
  labelForReader(button, `${fullDate}.${today ? " Today." : ""} ${action} ${detail}`.trim());
  button.createSpan({ cls: "daymark-margin-number", text: String(date.day) }).setAttr("aria-hidden", "true");
  const weekdayLabel = dateTimeFormatter(context.locale, { weekday: "short", timeZone: "UTC" }).format(toDate(date));
  const weekday = button.createSpan("daymark-margin-weekday");
  weekday.setAttr("aria-hidden", "true");
  weekday.dataset.weekday = weekdayLabel;
  weekday.createSpan({ cls: "daymark-margin-weekday-label", text: weekdayLabel });
  let mark: HTMLSpanElement | undefined;
  let hit: HTMLSpanElement | undefined;
  let renderedSymbol: string | undefined;
  button.addEventListener("click", () => context.onSelect(date));
  const details = row.createDiv("daymark-margin-details");
  const main = details.createDiv("daymark-margin-details-main");
  createDayName(row, main, iso, fullDate, context, contextMenuOnly, (name, editing = false) => {
    const { emoji, text } = splitDayName(name);
    const coil = !emoji && record !== null && !record.linkedWritingStatus;
    row.toggleClass("has-emoji", Boolean(emoji));
    row.toggleClass("has-coil", coil);
    if (!mark && (record || emoji)) {
      mark = button.createSpan("daymark-margin-symbol");
      mark.setAttr("aria-hidden", "true");
    }
    if (mark) {
      mark.toggleClass("daymark-margin-emoji", Boolean(emoji));
      mark.toggleClass("daymark-margin-mark", !emoji && record !== null);
      const symbol = emoji || (coil ? "coil" : "");
      if (symbol !== renderedSymbol) {
        mark.textContent = emoji;
        if (coil) {
          const svg = mark.createSvg("svg", { cls: "daymark-margin-coil", attr: {
            viewBox: "0 0 16 44", preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false"
          } });
          const shape = marginWritingCoil(marginWritingWords(record), context.wireSeed === undefined ? 0 : marginWireStyle(iso, context.wireSeed));
          svg.createSvg("path", { cls: "daymark-margin-coil-connectors", attr: { d: shape.connectors } });
          svg.createSvg("path", { cls: "daymark-margin-coil-loops", attr: { d: shape.path } });
        }
        renderedSymbol = symbol;
      }
      mark.hidden = Boolean(emoji) && editing;
    }
    if (!hit && (record || emoji)) {
      hit = button.createSpan("daymark-margin-spine-hit");
      hit.setAttr("aria-hidden", "true");
    }
    if (hit) {
      hit.hidden = (!record && !emoji) || (Boolean(emoji) && editing);
      setTooltip(hit, emoji ? `${name}\n${detail || "No daily note"}` : detail, tooltipOptions);
    }
    return text;
  });
  createLinkedNotes(row, main, details, iso, record?.linkedNotes ?? [], context);
  if (context.lens) {
    row.toggleClass("has-lens", true);
    const lens = context.lens;
    const value = lens.values.get(iso);
    const cell = main.createEl("button", { cls: "daymark-margin-lens-value" });
    cell.type = "button";
    labelForReader(cell, `${fullDate}. ${lens.label}: ${value === undefined ? "not recorded" : numberFormatter(context.locale, { maximumFractionDigits: 3 }).format(value)}. ${action}`);
    cell.addEventListener("click", () => context.onSelect(date));
    if (value !== undefined) {
      const track = cell.createSpan("daymark-margin-lens-track");
      track.setAttr("aria-hidden", "true");
      if (value > 0 && lens.maximum > 0) {
        const bar = track.createSpan("daymark-margin-lens-bar");
        bar.style.setProperty("width", `${Math.min(100, value / lens.maximum * 100)}%`);
      }
      cell.createSpan({ cls: "daymark-margin-lens-number", text: numberFormatter(context.locale, { maximumFractionDigits: 3 }).format(value) });
    } else if (today) cell.createSpan({ cls: "daymark-margin-lens-today", text: "Today" });
  }
  return row;
}

/** A quiet month boundary with the same grid and uninterrupted spine as day rows. */
export function createMarginMonthLabel(parent: HTMLElement, month: PlainDate, locale: string): HTMLElement {
  if (parent.dataset.gutterLocale !== locale) {
    const weekday = dateTimeFormatter(locale, { weekday: "short", timeZone: "UTC" });
    const number = numberFormatter(locale, {}).format(28);
    parent.dataset.gutterLocale = locale;
    parent.dataset.gutterNumber = number;
    parent.dataset.gutterLabels = [
      ...Array.from({ length: 7 }, (_, day) => weekday.format(new Date(Date.UTC(2023, 0, day + 1)))),
      `${number}–${number}`
    ].join("\n");
  }
  const row = parent.createDiv("daymark-margin-month-boundary");
  row.dataset.month = toIsoDate(month);
  row.createSpan({ cls: "daymark-margin-boundary-label", text: dateTimeFormatter(locale, {
    month: "long", ...(month.month === 1 ? { year: "numeric" as const } : {}), timeZone: "UTC"
  }).format(toDate(month)) });
  return row;
}

/** One disclosure target: paper edges and eyelets are decoration, never controls. */
export function createMarginFold(parent: HTMLElement, fold: MarginFold, locale: string, toggle: () => void) {
  const row = parent.createDiv("daymark-margin-fold");
  row.dataset.fold = fold.start;
  const button = row.createEl("button", { cls: "daymark-margin-fold-toggle" });
  button.type = "button";
  button.dataset.marginFocus = `fold:${fold.start}`;
  const range = button.createSpan("daymark-margin-fold-range");
  range.setAttr("aria-hidden", "true");
  const first = parseIsoDate(fold.start)!, last = parseIsoDate(fold.end)!;
  range.createSpan({ text: `${numberFormatter(locale, {}).format(first.day)}–${numberFormatter(locale, {}).format(last.day)}` });
  range.createSpan({ cls: "daymark-margin-fold-month", text: dateTimeFormatter(locale, { month: "short", timeZone: "UTC" }).format(toDate(first)) });
  const paper = button.createSpan("daymark-margin-fold-paper");
  paper.setAttr("aria-hidden", "true");
  paper.createSpan("daymark-margin-fold-face");
  const content = button.createSpan("daymark-margin-fold-content");
  content.setAttr("aria-hidden", "true");
  content.createSpan({ cls: "daymark-margin-fold-title", text: `${numberFormatter(locale, {}).format(fold.dates.length)} days` });
  const chevron = content.createSpan("daymark-margin-fold-chevron");
  setIcon(chevron, "chevron-down");
  button.createSpan("daymark-margin-fold-eyelets").setAttr("aria-hidden", "true");
  const label = button.createSpan("daymark-visually-hidden");
  label.id = `daymark-margin-label-${++labelSequence}`;
  button.setAttr("aria-labelledby", label.id);
  const fullDate = dateTimeFormatter(locale, { dateStyle: "long", timeZone: "UTC" });
  button.addEventListener("click", toggle);
  let current: boolean | undefined;
  return { row, button, update(expanded: boolean): void {
    if (expanded === current) return;
    current = expanded;
    row.toggleClass("is-expanded", expanded);
    button.setAttr("aria-expanded", String(expanded));
    label.textContent = `${expanded ? "Fold" : "Unfold"} ${fold.dates.length} days without daily notes, ${fullDate.format(toDate(first))} to ${fullDate.format(toDate(last))}`;
  } };
}
