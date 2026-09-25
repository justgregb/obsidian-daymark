import { setIcon, setTooltip } from "obsidian";
import { numberFormatter } from "./intl-cache";
import { marginTooltipOptions } from "./margin-calendar-view";
import type { MarginTallyLens } from "./margin-tally";

export interface MarginTallyControls {
  locale: string;
  period: string;
  lenses: () => readonly MarginTallyLens[];
  lens: MarginTallyLens | null;
  expanded: boolean;
  onExpanded: (expanded: boolean) => void;
  onLens: (id: string | null) => void;
  reportAction: (parent: HTMLElement) => void;
  additionalWords: (parent: HTMLElement) => void;
}

let panelSequence = 0;

export type MarginTallyHandle = (() => void) & { update: (context: MarginTallyControls) => void };

export function createMarginTally(parent: HTMLElement, context: MarginTallyControls): MarginTallyHandle {
  const toolbar = parent.createDiv("daymark-margin-tally-toolbar");
  const toggle = toolbar.createEl("button", { cls: "daymark-margin-tally-toggle" });
  toggle.type = "button";
  toggle.dataset.marginFocus = "tally";
  setIcon(toggle.createSpan("daymark-margin-header-chip"), "chart-no-axes-column");
  toggle.setAttr("aria-haspopup", "dialog");
  const panel = toolbar.createDiv("daymark-margin-tally-panel");
  panel.id = `daymark-margin-tally-${++panelSequence}`;
  panel.setAttr("role", "dialog");
  toggle.setAttr("aria-controls", panel.id);
  let list: HTMLElement | null = null;
  let heading: HTMLElement;
  let title: HTMLElement;
  let extra: HTMLElement;
  let empty: HTMLElement;
  let dirty = true;
  const items = new Map<string, { button: HTMLButtonElement; label: HTMLElement; total: HTMLElement }>();
  const text = (element: HTMLElement, value: string): void => {
    if (element.textContent !== value) element.setText(value);
  };
  const ensurePanel = (): void => {
    if (!list) {
      heading = panel.createDiv("daymark-margin-tally-heading");
      title = heading.createSpan("daymark-margin-tally-title");
      title.id = `${panel.id}-title`;
      panel.setAttr("aria-labelledby", title.id);
      list = panel.createDiv("daymark-margin-tally-list");
      empty = list.createEl("p", { cls: "daymark-tally-empty", text: "No activity this month." });
      extra = list.createDiv("daymark-margin-tally-extra");
    }
    if (!dirty) return;
    dirty = false;
    const scrollTop = list.scrollTop;
    const focused = parent.ownerDocument.activeElement;
    text(title, context.period);
    context.reportAction(heading);
    const available = context.lenses();
    const lenses = context.lens && !available.some(lens => lens.id === context.lens!.id)
      ? [...available, context.lens] : available;
    empty.hidden = lenses.length > 0;
    const retained = new Set(lenses.map(lens => lens.id));
    for (const [id, item] of items) if (!retained.has(id)) { item.button.remove(); items.delete(id); }
    const format = numberFormatter(context.locale, { maximumFractionDigits: 3 });
    let previous: Element = empty;
    for (const lens of lenses) {
      let item = items.get(lens.id);
      if (!item) {
        const button = list.createEl("button", { cls: "daymark-margin-tally-item" });
        button.type = "button";
        button.dataset.marginFocus = lens.id;
        button.toggleClass("is-tag", lens.id.startsWith("tag:"));
        item = { button, label: button.createSpan("daymark-margin-tally-label"), total: button.createSpan("daymark-margin-tally-total") };
        items.set(lens.id, item);
        button.addEventListener("click", () => context.onLens(lens.id === context.lens?.id ? null : lens.id));
      }
      item.button.setAttr("aria-pressed", String(lens.id === context.lens?.id));
      text(item.label, lens.label);
      text(item.total, format.format(lens.total));
      if (previous.nextElementSibling !== item.button) list.insertBefore(item.button, previous.nextElementSibling);
      previous = item.button;
    }
    context.additionalWords(extra);
    // Reordering a focused item can blur it in Chromium; preserve its focus too.
    if (focused && panel.contains(focused)) (focused as HTMLElement).focus({ preventScroll: true });
    else if (focused && !focused.isConnected) toggle.focus({ preventScroll: true });
    list.scrollTop = scrollTop;
  };
  const document = parent.ownerDocument;
  let expanded = context.expanded;
  let listening = false;
  const listen = (enabled: boolean): void => {
    if (enabled === listening) return;
    listening = enabled;
    for (const type of ["pointerdown", "focusin"]) {
      if (enabled) document.addEventListener(type, outside);
      else document.removeEventListener(type, outside);
    }
  };
  const update = (): void => {
    const format = numberFormatter(context.locale, { maximumFractionDigits: 3 });
    setTooltip(toggle, context.lens ? `Tally · ${context.lens.label} · ${format.format(context.lens.total)}` : "Tally", marginTooltipOptions);
    toggle.toggleClass("has-lens", context.lens !== null);
    if (expanded) ensurePanel();
    panel.hidden = !expanded;
    toggle.setAttr("aria-expanded", String(expanded));
    listen(expanded);
  };
  const close = (restore = false): void => {
    if (!expanded) return;
    expanded = false;
    context.onExpanded(false);
    update();
    if (restore) toggle.focus({ preventScroll: true });
  };
  toggle.addEventListener("click", () => {
    expanded = !expanded;
    context.onExpanded(expanded);
    update();
    if (expanded) list?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  });
  const outside = (event: Event): void => {
    if (!event.composedPath().includes(toolbar)) close();
  };
  const keyboard = (event: KeyboardEvent): void => {
    if (expanded && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  };
  toolbar.addEventListener("keydown", keyboard);
  update();
  const dispose = (): void => {
    listen(false);
    toolbar.removeEventListener("keydown", keyboard);
  };
  return Object.assign(dispose, { update(next: MarginTallyControls): void {
    context = next;
    expanded = next.expanded;
    dirty = true;
    update();
  } });
}
