import { describe, expect, it, vi } from "vitest";
import { createMarginTally } from "../src/margin-tally-view";
import type { MarginTallyLens } from "../src/margin-tally";
import { setIcon } from "obsidian";

vi.mock("obsidian", () => ({ setIcon: vi.fn(), setTooltip: vi.fn() }));

type Options = string | { cls?: string; text?: string };
class Element extends EventTarget {
  children: Element[] = [];
  attrs: Record<string, string> = {};
  dataset: Record<string, string> = {};
  classes = new Set<string>();
  hidden = false;
  text = "";
  parent: Element | null = null;
  scrollTop = 0;
  focus = vi.fn(() => { (this.ownerDocument as EventTarget & { activeElement?: Element }).activeElement = this; });
  get textContent(): string { return this.text; }
  setText(value: string): void { this.text = value; }
  get isConnected(): boolean { return this.parent !== null; }
  get nextElementSibling(): Element | null { return this.parent?.children[this.parent.children.indexOf(this) + 1] ?? null; }
  contains(element: Element): boolean { return this.all().includes(element); }
  remove(): void { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  insertBefore(element: Element, next: Element | null): void {
    element.remove(); element.parent = this;
    this.children.splice(next ? this.children.indexOf(next) : this.children.length, 0, element);
  }
  constructor(readonly ownerDocument: EventTarget, readonly tag = "div") { super(); }
  private appendElement(tag: string, options?: Options): Element {
    const child = new Element(this.ownerDocument, tag);
    const cls = typeof options === "string" ? options : options?.cls;
    child.classes = new Set(cls?.split(" "));
    child.text = typeof options === "object" ? options.text ?? "" : "";
    child.parent = this;
    this.children.push(child);
    return child;
  }
  createEl(tag: string, options?: Options): Element { return this.appendElement(tag, options); }
  createDiv(options?: Options): Element { return this.appendElement("div", options); }
  createSpan(options?: Options): Element { return this.appendElement("span", options); }
  setAttr(name: string, value: string): void { this.attrs[name] = value; }
  toggleClass(name: string, enabled: boolean): void { if (enabled) this.classes.add(name); else this.classes.delete(name); }
  all(): Element[] { return [this, ...this.children.flatMap(child => child.all())]; }
  find(cls: string): Element { return this.all().find(child => child.classes.has(cls))!; }
  querySelector(tag: string): Element | null { return this.all().find(child => child !== this && child.tag === tag) ?? null; }
}

const lens: MarginTallyLens = { id: "tag:swimming", label: "Swim sessions", total: 3.75, maximum: 3.75, values: new Map() };
function fixture(selected = false, expanded = false, lenses = [lens], selectedLens = lens) {
  const document = new EventTarget();
  const remove = vi.spyOn(document, "removeEventListener");
  const root = new Element(document);
  // The calendar is a sibling, not a child that summary interactions may replace.
  const dates = root.createDiv("dates");
  const context = {
    locale: "en", period: "September 2026", lenses: vi.fn(() => lenses), lens: selected ? selectedLens : null, expanded,
    onExpanded: vi.fn(), onLens: vi.fn(), reportAction: vi.fn(), additionalWords: vi.fn()
  };
  const dispose = createMarginTally(root as unknown as HTMLElement, context);
  return { root, dates, document, remove, context, dispose };
}

describe("Margin summary controls", () => {
  it("listens for outside interaction only while open, including after reopening", () => {
    const { root, document, context, dispose } = fixture();
    const outside = new Event("pointerdown");
    const path = vi.fn(() => []);
    outside.composedPath = path;
    document.dispatchEvent(outside);
    expect(path).not.toHaveBeenCalled();
    const toggle = root.find("daymark-margin-tally-toggle");
    toggle.dispatchEvent(new Event("click"));
    document.dispatchEvent(outside);
    expect(context.onExpanded).toHaveBeenLastCalledWith(false);
    expect(path).toHaveBeenCalledTimes(1);
    document.dispatchEvent(outside);
    expect(path).toHaveBeenCalledTimes(1);
    toggle.dispatchEvent(new Event("click"));
    document.dispatchEvent(outside);
    expect(path).toHaveBeenCalledTimes(2);
    toggle.dispatchEvent(new Event("click"));
    dispose(); document.dispatchEvent(outside);
    expect(path).toHaveBeenCalledTimes(2);
  });
  it("updates an open summary in place while preserving scroll, focus and current callbacks", () => {
    const { root, context, dispose } = fixture(false, true);
    const item = root.find("daymark-margin-tally-item");
    const panel = root.find("daymark-margin-tally-panel");
    const list = root.find("daymark-margin-tally-list");
    const toggle = root.find("daymark-margin-tally-toggle");
    item.focus(); list.scrollTop = 83;
    const next = { ...context, period: "October 2026", lens, lenses: () => [{ ...lens, total: 7 }], onLens: vi.fn() };
    dispose.update(next);
    expect(root.find("daymark-margin-tally-item")).toBe(item);
    expect(root.find("daymark-margin-tally-panel")).toBe(panel);
    expect(root.find("daymark-margin-tally-toggle")).toBe(toggle);
    expect(list.scrollTop).toBe(83);
    expect(root.find("daymark-margin-tally-title").text).toBe("October 2026");
    expect(item.find("daymark-margin-tally-total").text).toBe("7");
    item.dispatchEvent(new Event("click"));
    expect(next.onLens).toHaveBeenCalledWith(null);
    expect(context.onLens).not.toHaveBeenCalled();
    dispose();
  });
  it("reorders and removes metrics without replacing retained controls", () => {
    const another = { ...lens, id: "words", label: "Words", total: 100 };
    const { root, context, dispose } = fixture(false, true, [lens, another]);
    const original = root.find("daymark-margin-tally-item");
    dispose.update({ ...context, lenses: () => [another, lens] });
    const buttons = root.all().filter(item => item.classes.has("daymark-margin-tally-item"));
    expect(buttons.map(item => item.dataset.marginFocus)).toEqual(["words", "tag:swimming"]);
    expect(buttons[1]).toBe(original);
    original.focus();
    dispose.update({ ...context, lenses: () => [another] });
    expect(original.isConnected).toBe(false);
    expect(root.find("daymark-margin-tally-toggle").focus).toHaveBeenCalled();
    dispose();
  });
  it("defers updates to a closed panel until it is opened", () => {
    const { root, context, dispose } = fixture();
    const lenses = vi.fn(() => [{ ...lens, total: 9 }]);
    dispose.update({ ...context, lenses });
    expect(lenses).not.toHaveBeenCalled();
    root.find("daymark-margin-tally-toggle").dispatchEvent(new Event("click"));
    expect(root.find("daymark-margin-tally-total").text).toBe("9");
    dispose();
  });
  it("builds summary rows and starts report work only on first opening", () => {
    const { root, context } = fixture();
    const toggle = root.find("daymark-margin-tally-toggle");
    expect(root.find("daymark-margin-tally-item")).toBeUndefined();
    expect(context.reportAction).not.toHaveBeenCalled();
    expect(context.additionalWords).not.toHaveBeenCalled();
    expect(context.lenses).not.toHaveBeenCalled();
    toggle.dispatchEvent(new Event("click"));
    const item = root.find("daymark-margin-tally-item");
    expect(item).toBeDefined();
    toggle.dispatchEvent(new Event("click"));
    toggle.dispatchEvent(new Event("click"));
    expect(root.find("daymark-margin-tally-item")).toBe(item);
    expect(context.reportAction).toHaveBeenCalledOnce();
    expect(context.additionalWords).toHaveBeenCalledOnce();
    expect(context.lenses).toHaveBeenCalledOnce();
  });
  it("opens over the existing calendar and focuses a metric without rebuilding dates", () => {
    const { root, dates, context } = fixture();
    const panel = root.find("daymark-margin-tally-panel");
    const toggle = root.find("daymark-margin-tally-toggle");
    expect(setIcon).toHaveBeenCalledWith(toggle.find("daymark-margin-header-chip"), "chart-no-axes-column");
    expect(panel.hidden).toBe(true);
    toggle.dispatchEvent(new Event("click"));
    expect(panel.hidden).toBe(false);
    expect(toggle.attrs["aria-expanded"]).toBe("true");
    expect(context.onExpanded).toHaveBeenLastCalledWith(true);
    expect(root.find("daymark-margin-tally-item").focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(root.children[0]).toBe(dates);
  });
  it("selects the canonical tag ID while showing its custom name and exact total", () => {
    const { root, context } = fixture(false, true);
    const item = root.find("daymark-margin-tally-item");
    expect(item.find("daymark-margin-tally-label").text).toBe("Swim sessions");
    expect(item.find("daymark-margin-tally-total").text).toBe("3.75");
    item.dispatchEvent(new Event("click"));
    expect(context.onLens).toHaveBeenCalledExactlyOnceWith("tag:swimming");
  });
  it("toggles the selected metric back to day names without duplicate controls", () => {
    const { root, context } = fixture(true, true);
    const item = root.find("daymark-margin-tally-item");
    expect(item.attrs["aria-pressed"]).toBe("true");
    expect(item.find("daymark-margin-tally-label").text).toBe("Swim sessions");
    expect(item.find("daymark-margin-tally-total").text).toBe("3.75");
    expect(root.find("daymark-margin-lens-context")).toBeUndefined();
    expect(root.find("daymark-margin-lens-clear")).toBeUndefined();
    item.dispatchEvent(new Event("click"));
    expect(context.onLens).toHaveBeenCalledExactlyOnceWith(null);
  });
  it("keeps the current metric switchable in a month without any matches", () => {
    const { root, context } = fixture(true, true, [], { ...lens, total: 0, maximum: 0 });
    const item = root.find("daymark-margin-tally-item");
    expect(root.find("daymark-tally-empty").text).toBe("No activity this month.");
    expect(item.attrs["aria-pressed"]).toBe("true");
    expect(item.find("daymark-margin-tally-total").text).toBe("0");
    item.dispatchEvent(new Event("click"));
    expect(context.onLens).toHaveBeenCalledExactlyOnceWith(null);
  });
  it("keeps active-lens details inside the popover without another header row", () => {
    const { root } = fixture(true);
    const toolbar = root.find("daymark-margin-tally-toolbar");
    expect(toolbar.children).toEqual([root.find("daymark-margin-tally-toggle"), root.find("daymark-margin-tally-panel")]);
    expect(root.find("daymark-margin-tally-toggle").classes.has("has-lens")).toBe(true);
    expect(root.find("daymark-margin-tally-panel").hidden).toBe(true);
    expect(root.find("daymark-margin-lens-label")).toBeUndefined();
  });
  it("dismisses with Escape and restores the trigger without changing the lens", () => {
    const { root, context } = fixture(true, true);
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" });
    root.find("daymark-margin-tally-toolbar").dispatchEvent(event);
    expect(root.find("daymark-margin-tally-panel").hidden).toBe(true);
    expect(root.find("daymark-margin-tally-toggle").focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(context.onLens).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });
  it.each(["pointerdown", "focusin"])("dismisses on outside %s and cleans listeners on disposal", type => {
    const { root, document, context, dispose, remove } = fixture(false, true);
    document.dispatchEvent(new Event(type));
    expect(root.find("daymark-margin-tally-panel").hidden).toBe(true);
    expect(context.onExpanded).toHaveBeenLastCalledWith(false);
    dispose();
    expect(remove.mock.calls.map(args => args[0])).toEqual(["pointerdown", "focusin"]);
    document.dispatchEvent(new Event(type));
    expect(context.onExpanded).toHaveBeenCalledTimes(1);
  });
  it("leaves the summary open for interactions within it", () => {
    const { root, document, context } = fixture(false, true);
    const event = new Event("pointerdown");
    event.composedPath = () => [root.find("daymark-margin-tally-item"), root.find("daymark-margin-tally-toolbar")];
    document.dispatchEvent(event);
    expect(root.find("daymark-margin-tally-panel").hidden).toBe(false);
    expect(context.onExpanded).not.toHaveBeenCalled();
  });
  it("has a useful empty month state and preserves the report/additional-writing hooks", () => {
    const { root, context } = fixture(false, true, []);
    expect(root.find("daymark-tally-empty").text).toBe("No activity this month.");
    expect(context.reportAction).toHaveBeenCalledTimes(1);
    expect(context.additionalWords).toHaveBeenCalledTimes(1);
  });
});
