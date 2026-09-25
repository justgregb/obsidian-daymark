import { Notice, setIcon, setTooltip } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMarginDay, createMarginFold, createMarginHeader, createMarginMonthLabel, type MarginCalendarContext } from "../src/margin-calendar-view";
import { DEFAULT_SETTINGS, type DailyRecord, type Weekday } from "../src/types";
import { marginWireStyle, marginWritingCoil } from "../src/margin-calendar";

interface TestMenuItem {
  title: string;
  icon: string;
  action: () => void;
}
const menuState = vi.hoisted(() => ({ menus: [] as { items: TestMenuItem[]; positioned: string }[] }));

vi.mock("obsidian", () => ({
  Menu: class {
    items: TestMenuItem[] = [];
    positioned = "";
    private onHidden: (() => void) | undefined;
    onHide(callback: () => void): void { this.onHidden = callback; }
    hide(): this { this.onHidden?.(); return this; }
    constructor() { menuState.menus.push(this); }
    setParentElement(): this { return this; }
    addItem(callback: (item: unknown) => void): this {
      const item = {
        title: "", icon: "", action: () => undefined as void,
        setTitle(title: string) { this.title = title; return this; },
        setIcon(icon: string) { this.icon = icon; return this; },
        onClick(action: () => void) { this.action = action; return this; }
      };
      callback(item); this.items.push(item); return this;
    }
    showAtMouseEvent(): this { this.positioned = "mouse"; return this; }
    showAtPosition(): this { this.positioned = "keyboard"; return this; }
  },
  Notice: vi.fn(), setIcon: vi.fn(),
  setTooltip: vi.fn((element: HTMLElement, text: string) => element.setAttr("aria-label", text))
}));

type Options = string | { cls?: string; text?: string; attr?: Record<string, string | number | boolean> };
class ElementStub {
  hidden = false;
  tabIndex = 0;
  id = "";
  type = "";
  text = "";
  get textContent(): string { return this.text; }
  set textContent(value: string) { this.text = value; this.children = []; }
  value = "";
  isConnected = false;
  selectionStart = 0;
  selectionEnd = 0;
  clientWidth = 0;
  scrollWidth = 0;
  getBoundingClientRect() { return { left: 12, bottom: 26 }; }
  dataset: Record<string, string> = {};
  attrs: Record<string, string> = {};
  cssProps: Record<string, string> = {};
  style = { setProperty: (name: string, value: string): void => { this.cssProps[name] = value; } };
  classes = new Set<string>();
  children: ElementStub[] = [];
  listeners: Record<string, (event: Partial<KeyboardEvent>) => void> = {};
  focus = vi.fn();
  querySelector(selector: string): ElementStub | null { return this.all().find(el => el.classes.has(selector.slice(1))) ?? null; }
  replaceChildren(): void { this.children = []; }
  private appendElement(options?: Options): ElementStub {
    const child = new ElementStub();
    const cls = typeof options === "string" ? options : options?.cls;
    child.classes = new Set(cls?.split(" "));
    if (typeof options === "object") child.text = options.text ?? "";
    if (typeof options === "object") for (const [key, value] of Object.entries(options.attr ?? {})) child.setAttr(key, String(value));
    this.children.push(child);
    return child;
  }
  createEl(_tag: string, options?: Options): ElementStub { return this.appendElement(options); }
  createSvg(_tag: string, options?: Options): ElementStub { return this.appendElement(options); }
  createSpan(options?: Options): ElementStub { return this.appendElement(options); }
  createDiv(options?: Options): ElementStub { return this.appendElement(options); }
  setAttr(name: string, value: string): void { this.attrs[name] = value; }
  toggleClass(name: string, enabled: boolean): void {
    if (enabled) this.classes.add(name);
    else this.classes.delete(name);
  }
  addEventListener(event: string, callback: (event: Partial<KeyboardEvent>) => void): void { this.listeners[event] = callback; }
  all(): ElementStub[] { return [this, ...this.children.flatMap((child) => child.all())]; }
  find(cls: string): ElementStub { return this.all().find(el => el.classes.has(cls))!; }
  fire(event: string, props: Partial<KeyboardEvent> = {}): void {
    this.listeners[event]?.({ preventDefault: vi.fn(), stopPropagation: vi.fn(), ...props });
  }
  asElement(): HTMLElement { return this as unknown as HTMLElement; }
}

const date = { year: 2026, month: 9, day: 24 };
const iso = "2026-09-24";
const record: DailyRecord = {
  date, isoDate: iso, path: "Journal/2026-09-24.md", basename: iso,
  words: 12, photos: 2, totalCheckboxes: 1, completedCheckboxes: 1,
  taggedValues: [{ tag: "swimming", value: 0 }]
};
let context: MarginCalendarContext;
beforeEach(() => {
  vi.clearAllMocks();
  menuState.menus.length = 0;
  context = {
    locale: "en", settings: { ...DEFAULT_SETTINGS, dayNames: {} },
    selectedIso: "", todayIso: "2026-09-20",
    onSelect: vi.fn(), nameEditor: { draft: null }, onNameChange: vi.fn(() => Promise.resolve())
  };
});

function day(note: DailyRecord | null = record) {
  const parent = new ElementStub();
  createMarginDay(parent.asElement(), date, note, context);
  return parent.children[0];
}

function coilPath(row: ElementStub): string | undefined {
  return row.find("daymark-margin-coil-loops")?.attrs.d;
}

describe("compact linked titles", () => {
  const notes = [{ path: "Books/Dune.md", title: "Dune" }, { path: "Films/Arrival.md", title: "Arrival" }, { path: "Games/Journey.md", title: "Journey" }];
  const rename = (row: ElementStub) => { row.fire("contextmenu"); menuState.menus.at(-1)!.items[0].action(); };
  it("omits the pencil and names an unnamed linked day only through its context menu", () => {
    context.onOpenLinkedNote = vi.fn(async () => {});
    const row = day({ ...record, linkedNotes: notes });
    expect(row.find("daymark-margin-name")).toBeUndefined();
    expect(row.find("daymark-margin-name-icon")).toBeUndefined();
    rename(row);
    expect(row.classes.has("is-editing")).toBe(true);
    const input = row.find("daymark-margin-name-input");
    input.value = "Reading day";
    input.fire("keydown", { key: "Enter" });
    expect(context.onNameChange).toHaveBeenCalledWith(iso, "Reading day");
    expect(row.find("daymark-margin-name-text").text).toBe("Reading day");
    expect(row.find("daymark-margin-name").classes.has("is-readonly")).toBe(true);
    expect(row.find("daymark-margin-date").focus).toHaveBeenCalled();
    expect(row.classes.has("is-unnamed")).toBe(false);
    expect(row.find("daymark-margin-linked-title").text).toBe("Dune");
    expect(context.onSelect).not.toHaveBeenCalled();
    expect(context.onOpenLinkedNote).not.toHaveBeenCalled();
  });
  it("keeps Today as plain text above linked notes and renames it through the context menu", () => {
    context.todayIso = iso;
    const row = day({ ...record, linkedNotes: notes });
    expect(row.find("daymark-margin-name-text").text).toBe("Today");
    row.find("daymark-margin-name").fire("click");
    expect(row.find("daymark-margin-name-input")).toBeUndefined();
    rename(row);
    let input = row.find("daymark-margin-name-input");
    input.value = "A new chapter"; input.fire("keydown", { key: "Enter" });
    expect(row.find("daymark-margin-name-text").text).toBe("A new chapter");
    row.find("daymark-margin-name").fire("click");
    expect(row.find("daymark-margin-name-input")).toBeUndefined();
    rename(row);
    input = row.find("daymark-margin-name-input");
    input.value = ""; input.fire("keydown", { key: "Enter" });
    expect(row.find("daymark-margin-name-text").text).toBe("Today");
    expect(row.classes.has("is-unnamed")).toBe(false);
    expect(context.onNameChange).toHaveBeenLastCalledWith(iso, "");
  });
  it("keeps expanded links in the same content column and preserves them through cancelled naming", () => {
    context.expandedLinks = new Set([iso]);
    const row = day({ ...record, linkedNotes: notes });
    const details = row.find("daymark-margin-details");
    const list = row.find("daymark-margin-linked-list");
    expect(details.children).toEqual([row.find("daymark-margin-details-main"), list]);
    expect(row.children).not.toContain(list);
    rename(row);
    const input = row.find("daymark-margin-name-input");
    input.value = "Unsaved"; input.fire("keydown", { key: "Escape" });
    expect(row.find("daymark-margin-linked-list")).toBe(list);
    expect(context.expandedLinks.has(iso)).toBe(true);
    expect(row.find("daymark-margin-name")).toBeUndefined();
    expect(row.find("daymark-margin-date").focus).toHaveBeenCalled();
    expect(context.onNameChange).not.toHaveBeenCalled();
  });
  it("shows a single linked title without a disclosure and opens the note without renaming", () => {
    context.onOpenLinkedNote = vi.fn(async () => {});
    const row = day({ ...record, linkedNotes: notes.slice(0, 1) });
    expect(row.find("daymark-margin-linked-title").text).toBe("Dune");
    const button = row.find("daymark-margin-linked-first");
    const label = button.find("daymark-visually-hidden");
    expect(label.text).toBe("Open linked note: Dune");
    expect(button.attrs["aria-labelledby"]).toBe(label.id);
    expect(setTooltip).toHaveBeenCalledWith(button, "Dune\nBooks/", expect.objectContaining({ delay: 650, classes: ["daymark-margin-tooltip", "daymark-margin-linked-tooltip"] }));
    expect(row.find("daymark-margin-linked-more")).toBeUndefined();
    expect(row.classes.has("is-unnamed")).toBe(true);
    row.find("daymark-margin-linked-first").fire("click");
    expect(context.onOpenLinkedNote).toHaveBeenCalledWith("Books/Dune.md", false);
    expect(context.onSelect).not.toHaveBeenCalled();
    expect(context.onNameChange).not.toHaveBeenCalled();
  });
  it("keeps the total link count stable while expanding, redrawing and collapsing additional notes", () => {
    context.expandedLinks = new Set();
    context.onLayoutChange = vi.fn((change: () => void) => change());
    const note = { ...record, linkedNotes: notes };
    let row = day(note);
    let more = row.find("daymark-margin-linked-more");
    expect(more.children[0].text).toBe("3");
    expect(more.attrs["aria-label"]).toBe("3 linked notes. Show 2 additional notes");
    expect(row.find("daymark-margin-linked-list").children).toHaveLength(0);
    more.fire("click");
    expect(context.onLayoutChange).toHaveBeenCalledTimes(1);
    expect(row.find("daymark-margin-linked-list").hidden).toBe(false);
    expect(row.find("daymark-margin-linked-list").children.map(button => button.find("daymark-margin-linked-title").text)).toEqual(["Arrival", "Journey"]);
    expect(row.find("daymark-margin-linked-list").children.map(button => button.find("daymark-visually-hidden").text)).toEqual(["Open linked note: Arrival", "Open linked note: Journey"]);
    row = day(note); more = row.find("daymark-margin-linked-more");
    expect(more.attrs["aria-expanded"]).toBe("true");
    expect(more.children[0].text).toBe("3");
    expect(more.attrs["aria-label"]).toBe("3 linked notes. Hide 2 additional notes");
    more.fire("click");
    expect(row.find("daymark-margin-linked-list").hidden).toBe(true);
    expect(context.expandedLinks.has(iso)).toBe(false);
    expect(more.children[0].text).toBe("3");
  });
  it("shows a readable title without a repeated filename for root-level linked notes", () => {
    const row = day({ ...record, linkedNotes: [{ path: "A walk by the sea.md", title: "A walk by the sea" }] });
    expect(setTooltip).toHaveBeenCalledWith(row.find("daymark-margin-linked-first"), "A walk by the sea", expect.objectContaining({ delay: 650 }));
  });
  it("opens modifier-clicked links in a new tab and reports failed opens", async () => {
    context.onOpenLinkedNote = vi.fn(async () => { throw new Error("Missing"); });
    day({ ...record, linkedNotes: notes }).find("daymark-margin-linked-first").fire("click", { metaKey: true });
    expect(context.onOpenLinkedNote).toHaveBeenCalledWith("Books/Dune.md", true);
    await Promise.resolve();
    expect(Notice).toHaveBeenCalledWith("Could not open this linked note. Please try again.");
  });
  it("keeps the day name primary and leaves linked controls out of a Tally lens", () => {
    context.settings.dayNames[iso] = "Reading day";
    let row = day({ ...record, linkedNotes: notes });
    expect(row.find("daymark-margin-name-text").text).toBe("Reading day");
    expect(row.classes.has("is-unnamed")).toBe(false);
    context.lens = { id: "words", label: "Words", total: 12, maximum: 12, values: new Map([[iso, 12]]) };
    row = day({ ...record, linkedNotes: notes });
    expect(row.find("daymark-margin-linked-preview")).toBeUndefined();
  });
  it.each([false, true])("uses only the context menu for linked-day renaming, lens=%s", lens => {
    if (lens) context.lens = { id: "words", label: "Words", total: 12, maximum: 12, values: new Map([[iso, 12]]) };
    const row = day({ ...record, linkedNotes: notes });
    expect(row.find("daymark-margin-date").attrs["aria-keyshortcuts"]).toBeUndefined();
    row.fire("keydown", { key: "F2" });
    expect(row.find("daymark-margin-name-input")).toBeUndefined();
    row.fire("keydown", { key: "F10", shiftKey: true });
    expect(menuState.menus.at(-1)!.positioned).toBe("keyboard");
    menuState.menus.at(-1)!.items[0].action();
    const input = row.find("daymark-margin-name-input");
    expect(input).toBeDefined();
    input.fire("keydown", { key: "Escape" });
    expect(row.find("daymark-margin-date").focus).toHaveBeenCalled();
  });
});

describe("recurring date grain", () => {
  it("shades adjacent configured weekdays and leaves ordinary days clear", () => {
    context.settings.highlightedWeekdays = [6, 0];
    const make = (n: number) => {
      const parent = new ElementStub();
      createMarginDay(parent.asElement(), { ...date, day: n }, null, context);
      return parent.children[0];
    };
    for (const n of [26, 27]) {
      const row = make(n);
      expect(row.classes.has("is-highlighted")).toBe(true);
      expect(row.find("daymark-margin-recurring").attrs["aria-hidden"]).toBe("true");
    }
    expect(make(28).find("daymark-margin-recurring")).toBeUndefined();
  });
  it("respects custom recurring weekdays at a month boundary and disabling shading", () => {
    context.settings.highlightedWeekdays = [3, 4];
    const parent = new ElementStub();
    createMarginDay(parent.asElement(), { ...date, day: 30 }, null, context);
    expect(parent.children[0].find("daymark-margin-recurring")).toBeDefined();
    expect(day().find("daymark-margin-recurring")).toBeDefined();
    context.settings.highlightedWeekdays = [];
    expect(day().find("daymark-margin-recurring")).toBeUndefined();
  });
});

it("keeps a date's randomly assigned wire style stable across redraws", () => {
  context.wireSeed = 2468;
  const note = { ...record, words: 320 };
  const expected = marginWritingCoil(note.words, marginWireStyle(iso, context.wireSeed)).path;
  expect(coilPath(day(note))).toBe(expected);
  context.selectedIso = iso;
  expect(coilPath(day(note))).toBe(expected);
});

describe("Margin spine", () => {
  it("keeps one coil while editing plain names and restores it after removing an emoji", () => {
    const row = day();
    const coil = row.find("daymark-margin-coil");
    expect(coil.attrs.preserveAspectRatio).toBe("none");
    expect(coil.attrs.focusable).toBe("false");
    expect(row.find("daymark-margin-coil-connectors").attrs.d).toBe(marginWritingCoil(record.words).connectors);
    row.find("daymark-margin-name").fire("click");
    expect(row.find("daymark-margin-coil")).toBe(coil);
    let input = row.find("daymark-margin-name-input");
    input.value = "A walk"; input.fire("keydown", { key: "Enter" });
    expect(row.find("daymark-margin-coil")).toBe(coil);
    row.find("daymark-margin-name").fire("click");
    input = row.find("daymark-margin-name-input");
    input.value = "👋 A walk"; input.fire("keydown", { key: "Enter" });
    expect(coilPath(row)).toBeUndefined();
    expect(row.classes.has("has-coil")).toBe(false);
    row.find("daymark-margin-name").fire("click");
    input = row.find("daymark-margin-name-input");
    input.value = "A walk"; input.fire("keydown", { key: "Enter" });
    expect(row.all().filter(el => el.classes.has("daymark-margin-coil"))).toHaveLength(1);
    expect(coilPath(row)).toBe(marginWritingCoil(record.words).path);
    expect(row.classes.has("has-coil")).toBe(true);
  });

  it.each(["", "👋 Test"])("retains note selection on the spine for the day name %s", name => {
    context.settings.dayNames[iso] = name;
    for (const note of [record, null]) {
      const row = day(note);
      const button = row.find("daymark-margin-date");
      const hit = row.find("daymark-margin-spine-hit");
      if (hit) {
        expect(button.children).toContain(hit);
        expect(hit.listeners.click).toBeUndefined();
      }
      button.fire("click");
      expect(context.onSelect).toHaveBeenLastCalledWith(date);
      expect(context.onNameChange).not.toHaveBeenCalled();
      expect(row.find("daymark-margin-name-input")).toBeUndefined();
    }
  });
  it.each([record, { ...record, photos: 0 }, null])("uses the leading emoji in place of the note mark without changing note actions", note => {
    context.settings.dayNames[iso] = "📖 Finished Dune";
    const row = day(note);
    expect(row.find("daymark-margin-emoji").text).toBe("📖");
    expect(row.find("daymark-margin-emoji").attrs["aria-hidden"]).toBe("true");
    expect(row.find("daymark-margin-mark")).toBeUndefined();
    expect(row.find("daymark-margin-coil")).toBeUndefined();
    expect(row.classes.has("has-coil")).toBe(false);
    expect(row.find("daymark-margin-photo")).toBeUndefined();
    expect(row.find("daymark-margin-name").text).toBe("Finished Dune");
    expect(row.classes.has("has-note")).toBe(note !== null);
    expect(row.find("daymark-margin-spine-hit").hidden).toBe(false);
    expect(row.find("daymark-margin-spine-hit").attrs["aria-label"])
      .toBe(`📖 Finished Dune\n${note ? note.photos ? "12 words · 2 photos" : "12 words" : "No daily note"}`);
    row.find("daymark-margin-name").fire("click");
    expect(row.find("daymark-margin-name-input").value).toBe("📖 Finished Dune");
    expect(row.find("daymark-margin-emoji").hidden).toBe(true);
    expect(row.find("daymark-margin-spine-hit").hidden).toBe(true);
    expect(context.onNameChange).not.toHaveBeenCalled();
    row.find("daymark-margin-date").fire("click");
    expect(context.onSelect).toHaveBeenCalledExactlyOnceWith(date);
  });
  it.each([false, true])("allows emoji-only names to leave the name area empty, today=%s", today => {
    if (today) context.todayIso = iso;
    context.settings.dayNames[iso] = "👋🏽";
    const row = day(null);
    const name = row.find("daymark-margin-name");
    expect(name.text).toBe("");
    expect(name.classes.has("is-empty")).toBe(true);
    expect(row.find("daymark-margin-emoji").text).toBe("👋🏽");
    expect(name.find("daymark-visually-hidden").text).toContain("Edit day name: 👋🏽");
    name.fire("click");
    expect(row.find("daymark-margin-name-input").value).toBe("👋🏽");
    row.find("daymark-margin-name-input").value = "";
    row.find("daymark-margin-name-input").fire("keydown", { key: "Enter" });
    expect(row.find("daymark-margin-emoji")).toBeUndefined();
    expect(row.find("daymark-margin-name").text).toBe(today ? "Today" : "");
  });
  it("keeps the emoji on the spine when a Tally lens occupies the name column", () => {
    context.settings.dayNames[iso] = "🎬 Movie night";
    context.lens = { id: "words", label: "Words", values: new Map([[iso, 12]]), total: 12, maximum: 12 };
    const row = day();
    expect(row.find("daymark-margin-emoji").text).toBe("🎬");
    expect(row.find("daymark-margin-lens-number").text).toBe("12");
    row.fire("keydown", { key: "F2" });
    expect(row.find("daymark-margin-name-input").value).toBe("🎬 Movie night");
  });
  it("restores the underlying mark on edit or clear and preserves emoji when cancelling", () => {
    for (const note of [record, { ...record, photos: 0 }, null]) {
      context.settings.dayNames[iso] = "📖 Finished Dune";
      const row = day(note);
      row.find("daymark-margin-name").fire("click");
      let input = row.find("daymark-margin-name-input");
      input.value = "Dune"; input.fire("keydown", { key: "Escape" });
      expect(row.find("daymark-margin-emoji").text).toBe("📖");
      row.find("daymark-margin-name").fire("click");
      input = row.find("daymark-margin-name-input");
      input.value = "Dune"; input.fire("keydown", { key: "Enter" });
      expect(row.find("daymark-margin-emoji")).toBeUndefined();
      if (note) {
        expect(row.find("daymark-margin-mark")).toBeDefined();
        expect(coilPath(row)).toBe(marginWritingCoil(note.words).path);
        expect(row.classes.has("has-coil")).toBe(true);
      }
      expect(row.find("daymark-margin-name").text).toBe("Dune");
    }
  });
  it("restores the saved marker and keeps the full draft when saving fails", async () => {
    context.settings.dayNames[iso] = "📖 Reading";
    context.onNameChange = vi.fn(() => Promise.reject(new Error("Cannot write")));
    const row = day(); row.isConnected = true;
    row.find("daymark-margin-name").fire("click");
    const input = row.find("daymark-margin-name-input");
    input.value = "🎬 Movie"; input.fire("keydown", { key: "Enter" });
    await Promise.resolve();
    expect(row.find("daymark-margin-emoji").text).toBe("📖");
    expect(row.find("daymark-margin-name-input").value).toBe("🎬 Movie");
    expect(context.settings.dayNames[iso]).toBe("📖 Reading");
    row.find("daymark-margin-name-input").fire("keydown", { key: "Escape" });
    expect(row.find("daymark-margin-name").text).toBe("Reading");
  });
  it("restores the normal mark on Clear name and puts the emoji back on a failed clear", async () => {
    context.settings.dayNames[iso] = "📖 Reading";
    context.onNameChange = vi.fn(() => Promise.reject(new Error("Cannot write")));
    const row = day(); row.isConnected = true; row.fire("contextmenu");
    menuState.menus[0].items[1].action();
    expect(row.find("daymark-margin-emoji")).toBeUndefined();
    expect(row.find("daymark-margin-mark")).toBeDefined();
    await Promise.resolve();
    expect(row.find("daymark-margin-emoji").text).toBe("📖");
    expect(row.find("daymark-margin-photo")).toBeUndefined();
    expect(row.find("daymark-margin-name").text).toBe("Reading");
  });
  it.each([0, 1])("puts the writing tooltip on the spine gutter without adding a control, photos=%s", photos => {
    const row = day({ ...record, photos });
    const button = row.find("daymark-margin-date");
    const mark = row.find("daymark-margin-mark");
    const hit = row.find("daymark-margin-spine-hit");
    expect(button.children).toContain(hit);
    expect(hit.attrs["aria-hidden"]).toBe("true");
    expect(hit.attrs["tabindex"]).toBeUndefined();
    expect(mark.attrs["aria-label"]).toBeUndefined();
    expect(button.attrs["aria-label"]).toBeUndefined();
    expect(setTooltip).toHaveBeenCalledWith(hit, photos ? "12 words · 1 photo" : "12 words", expect.objectContaining({ delay: 650 }));
    expect(hit.listeners.click).toBeUndefined(); // Native bubbling retains the date button's action.
    button.fire("click");
    expect(context.onSelect).toHaveBeenCalledExactlyOnceWith(date);
    expect(context.onNameChange).not.toHaveBeenCalled();
  });
  it("keeps empty dates free of writing-tooltip targets", () => {
    expect(day(null).find("daymark-margin-spine-hit")).toBeUndefined();
  });
  it("preserves the draft and caret on a recycling blur, but still saves on deliberate blur", () => {
    const row = day();
    row.find("daymark-margin-name").fire("click");
    const input = row.find("daymark-margin-name-input");
    input.value = "Still writing"; input.selectionStart = 4; input.selectionEnd = 6; input.fire("input");
    context.nameEditor.moving = true; input.fire("blur");
    expect(context.nameEditor.draft).toEqual({ iso, value: "Still writing", start: 4, end: 6 });
    expect(row.find("daymark-margin-name-input")).toBe(input);
    expect(context.onNameChange).not.toHaveBeenCalled();
    context.nameEditor.moving = false; input.fire("blur");
    expect(context.onNameChange).toHaveBeenCalledExactlyOnceWith(iso, "Still writing");
    expect(context.nameEditor.draft).toBeNull();
  });
  it.each(["loading", "unavailable"] as const)("labels %s linked writing explicitly without claiming a final count", status => {
    const row = day({ ...record, photos: 0, words: 800, linkedWritingStatus: status });
    expect(row.classes.has("is-writing-pending")).toBe(true);
    expect(row.classes.has("has-coil")).toBe(false);
    expect(coilPath(row)).toBeUndefined();
    expect(row.attrs["aria-busy"]).toBe(status === "loading" ? "true" : undefined);
    expect(row.find("daymark-margin-spine-hit").attrs["aria-label"])
      .toBe(`800 known words · ${status === "loading" ? "Linked writing loading…" : "Some linked writing unavailable"}`);
    const photo = day({ ...record, linkedWritingStatus: status });
    expect(photo.find("daymark-margin-photo")).toBeUndefined();
    expect(photo.find("daymark-margin-mark")).toBeDefined();
  });
  it("labels a month independently of its first day's name and editor", () => {
    const first = { year: 2026, month: 10, day: 1 };
    context.settings.dayNames = { "2026-10-01": "A new chapter" };
    const parent = new ElementStub();
    createMarginMonthLabel(parent.asElement(), first, "en");
    createMarginDay(parent.asElement(), first, record, context);
    const [boundary, row] = parent.children;
    expect(boundary.find("daymark-margin-boundary-label").text).toBe("October");
    expect(row.find("daymark-margin-name").text).toBe("A new chapter");
    row.find("daymark-margin-name").fire("click");
    expect(parent.children[0]).toBe(boundary);
    expect(row.find("daymark-margin-name-input").value).toBe("A new chapter");
    expect(context.onNameChange).not.toHaveBeenCalled();
  });
  it("includes the year at January's boundary without changing a Tally row", () => {
    context.todayIso = "2027-01-01";
    context.lens = { id: "words", label: "Words", total: 12, maximum: 12, values: new Map([[context.todayIso, 12]]) };
    const first = { year: 2027, month: 1, day: 1 };
    const parent = new ElementStub();
    createMarginMonthLabel(parent.asElement(), first, "en");
    createMarginDay(parent.asElement(), first, record, context);
    const [boundary, row] = parent.children;
    expect(boundary.find("daymark-margin-boundary-label").text).toBe("January 2027");
    expect(row.find("daymark-margin-name").text).toBe("Today");
    expect(row.find("daymark-margin-lens-number").text).toBe("12");
    expect(row.find("daymark-margin-month-boundary")).toBeUndefined();
  });
  it("shows a Tally value without changing the date, note mark, or stored name", () => {
    context.settings.dayNames = { [iso]: "A quiet day" };
    context.lens = { id: "tag:swimming", label: "Swim sessions", total: 6, maximum: 4, values: new Map([[iso, 2]]) };
    const row = day();
    expect(row.classes.has("has-lens")).toBe(true);
    expect(row.find("daymark-margin-name").text).toBe("A quiet day");
    expect(row.find("daymark-margin-lens-number").text).toBe("2");
    expect(row.find("daymark-margin-lens-bar").cssProps.width).toBe("50%");
    expect(row.find("daymark-margin-weekday-label").text).toBe("Thu");
    expect(row.find("daymark-margin-mark")).toBeDefined();
    expect(row.find("daymark-margin-photo")).toBeUndefined();
    row.find("daymark-margin-lens-value").fire("click");
    expect(context.onSelect).toHaveBeenCalledExactlyOnceWith(date);
    expect(context.onNameChange).not.toHaveBeenCalled();
  });
  it("shows a numeric zero with no filled bar, and leaves unmatched dates blank", () => {
    context.lens = { id: "tag:swimming", label: "Swim sessions", total: 0, maximum: 0, values: new Map([[iso, 0]]) };
    expect(day().find("daymark-margin-lens-number").text).toBe("0");
    expect(day().find("daymark-margin-lens-bar")).toBeUndefined();
    context.lens = { ...context.lens, values: new Map() };
    expect(day().find("daymark-margin-lens-number")).toBeUndefined();
    context.todayIso = iso;
    expect(day().find("daymark-margin-lens-today").text).toBe("Today");
  });
  it("still allows deliberate naming with F2 in a lens", () => {
    context.lens = { id: "words", label: "Words", total: 12, maximum: 12, values: new Map([[iso, 12]]) };
    const row = day();
    row.fire("keydown", { key: "F2" });
    expect(row.classes.has("is-editing")).toBe(true);
    row.find("daymark-margin-name-input").value = "Named in lens";
    row.find("daymark-margin-name-input").fire("keydown", { key: "Enter" });
    expect(context.onNameChange).toHaveBeenCalledExactlyOnceWith(iso, "Named in lens");
  });
  it.each([false, true])("labels today without replacing a custom day name, selected=%s", selected => {
    context.todayIso = iso;
    context.selectedIso = selected ? iso : "";
    context.settings.dayNames = { [iso]: "A quiet day" };
    for (const note of [record, null]) {
      const row = day(note);
      expect(row.find("daymark-margin-weekday-label").text).toBe("Thu");
      expect(row.find("daymark-margin-name").text).toBe("A quiet day");
      expect(row.classes.has("is-today")).toBe(true);
      expect(row.classes.has("is-selected")).toBe(selected);
      expect(row.find("daymark-margin-date").attrs["aria-current"]).toBe("date");
      const reader = row.find("daymark-margin-date").children.find(child => child.classes.has("daymark-visually-hidden"));
      expect(reader?.text).toContain("Today.");
      expect(reader?.text).toContain("Thursday");
    }
    expect(context.onNameChange).not.toHaveBeenCalled();
  });
  it("shows Today in the empty name area without saving it as a custom name", () => {
    context.todayIso = iso;
    const row = day(null);
    expect(row.find("daymark-margin-name").text).toBe("Today");
    expect(row.find("daymark-margin-name").classes.has("is-empty")).toBe(false);
    expect(row.find("daymark-margin-name-icon")).toBeUndefined();
    row.find("daymark-margin-name").fire("click");
    expect(row.find("daymark-margin-name-input").value).toBe("");
    row.find("daymark-margin-name-input").fire("keydown", { key: "Enter" });
    expect(context.onNameChange).not.toHaveBeenCalled();
    row.find("daymark-margin-name").fire("click");
    row.find("daymark-margin-name-input").value = "A walk";
    row.find("daymark-margin-name-input").fire("keydown", { key: "Enter" });
    expect(context.onNameChange).toHaveBeenLastCalledWith(iso, "A walk");
    expect(row.find("daymark-margin-name").text).toBe("A walk");
    row.find("daymark-margin-name").fire("click");
    row.find("daymark-margin-name-input").value = "";
    row.find("daymark-margin-name-input").fire("keydown", { key: "Enter" });
    expect(context.onNameChange).toHaveBeenLastCalledWith(iso, "");
    expect(row.find("daymark-margin-name").text).toBe("Today");
  });
  it("keeps the weekday label on other dates", () => {
    expect(day().find("daymark-margin-weekday-label").text).toBe("Thu");
  });
  it("scales the single note mark with daily plus linked writing", () => {
    const row = day({ ...record, photos: 0, linkedWords: 1200, linkedNoteCount: 2 });
    expect(coilPath(row)).toBe(marginWritingCoil(800).path);
    expect(row.find("daymark-margin-spine-hit").attrs["aria-label"]).toBe("1,212 words · 12 here + 1,200 in 2 linked notes");
    expect(row.all().some(el => el.classes.has("daymark-margin-band") || el.classes.has("daymark-margin-tally-cap"))).toBe(false);
  });
  it.each([0, 1])("omits a zero linked-word breakdown while preserving %s photos", photos => {
    for (const linkedWords of [0, undefined]) {
      const row = day({ ...record, words: 28, photos, linkedWords, linkedNoteCount: 1 });
      const mark = row.find("daymark-margin-spine-hit");
      expect(mark.attrs["aria-label"]).toBe(photos ? "28 words · 1 photo" : "28 words");
      expect(row.find("daymark-margin-date").find("daymark-visually-hidden").text).not.toContain("linked note");
    }
  });
  it("retains a positive linked-writing breakdown beside a photo count", () => {
    const row = day({ ...record, words: 28, photos: 1, linkedWords: 100, linkedNoteCount: 1 });
    expect(row.find("daymark-margin-spine-hit").attrs["aria-label"])
      .toBe("128 words · 28 here + 100 in 1 linked note · 1 photo");
  });
  it("distinguishes a zero-word note from no note", () => {
    expect(coilPath(day({ ...record, photos: 0, words: 0 }))).toBe(marginWritingCoil(0).path);
    expect(day(null).find("daymark-margin-mark")).toBeUndefined();
    expect(day(null).classes.has("has-coil")).toBe(false);
  });
  it.each([1, 2, 20])("uses writing volume for notes with %s photos, keeping counts in the tooltip", photos => {
    for (const words of [0, 400, 2000]) {
      const row = day({ ...record, photos, words });
      expect(row.find("daymark-margin-photo")).toBeUndefined();
      expect(row.all().filter(el => el.classes.has("daymark-margin-mark"))).toHaveLength(1);
      expect(coilPath(row)).toBe(marginWritingCoil(words).path);
      expect(row.find("daymark-margin-spine-hit").attrs["aria-label"])
        .toContain(`${words.toLocaleString("en")} words · ${photos} photo`);
    }
  });
  it("keeps Margin writing marks and photo counts independent of Standard note covers", () => {
    context.settings.showCoverPhotos = false;
    const row = day();
    expect(row.find("daymark-margin-photo")).toBeUndefined();
    expect(row.find("daymark-margin-mark")).toBeDefined();
    expect(row.find("daymark-margin-spine-hit").attrs["aria-label"]).toBe("12 words · 2 photos");
  });
  it.each([false, true])("keeps note actions accessible without an intrusive row tooltip, today=%s", (today) => {
    context.todayIso = today ? iso : "";
    for (const note of [record, null]) {
      const button = day(note).find("daymark-margin-date");
      expect(button.attrs["aria-label"]).toBeUndefined();
      const reader = button.children.find(child => child.id === button.attrs["aria-labelledby"]);
      expect(reader?.text).toContain("September 24, 2026");
      expect(reader?.text).toContain(note ? "Open daily note" : "select to confirm creation");
      if (today) expect(reader?.text).toContain("Today.");
      button.fire("click");
      expect(context.onSelect).toHaveBeenCalledWith(date);
    }
  });
  it.each([[], [0, 6], [1, 3, 5]] as Weekday[][])("uses configured recurring weekdays only: %s", (...days) => {
    context.settings.highlightedWeekdays = days;
    for (const note of [record, null]) {
      const parent = new ElementStub();
      for (let weekday = 0; weekday < 7; weekday++) {
        createMarginDay(parent.asElement(), { year: 2026, month: 9, day: 20 + weekday }, note, context);
      }
      expect(parent.children.map(row => row.classes.has("is-highlighted")))
        .toEqual(Array.from({ length: 7 }, (_, index) => days.includes(index as Weekday)));
    }
  });
  it.each([2, 8, 9, 12])("groups the accessible Locate icon before Tally beside month %s", (month) => {
    const parent = new ElementStub();
    const navigation = { onToday: vi.fn() };
    const monthDate = { year: 2026, month, day: 1 };
    const tallySlot = createMarginHeader(parent.asElement(), monthDate, "en", navigation);
    const header = parent.find("daymark-margin-header");
    expect(parent.find("daymark-margin-end")).toBeUndefined();
    expect(header.children).toHaveLength(2);
    expect(header.children[0].classes.has("daymark-margin-period")).toBe(true);
    expect(header.children[0].find("daymark-margin-year").text).toBe("2026");
    expect(header.children[0].find("daymark-visually-hidden").text).toContain("2026");
    const actions = header.children[1];
    expect(actions.classes.has("daymark-margin-actions")).toBe(true);
    expect(actions.children).toHaveLength(2);
    const today = actions.children[0];
    expect(today.classes.has("daymark-margin-today")).toBe(true);
    const chip = today.find("daymark-margin-header-chip");
    expect(chip.text).toBe("");
    expect(today.type).toBe("button");
    expect(today.attrs["aria-label"]).toBe("Go to today");
    expect(setIcon).toHaveBeenCalledWith(chip, "locate-fixed");
    expect(actions.children[1].classes.has("daymark-margin-tally-slot")).toBe(true);
    expect(tallySlot).toBe(actions.children[1]);
    expect(parent.find("daymark-margin-nav")).toBeUndefined();
    header.children[0].fire("click");
    expect(navigation.onToday).not.toHaveBeenCalled();
    today.fire("click");
    expect(navigation.onToday).toHaveBeenCalledOnce();
  });
});

describe("Inline day names", () => {
  it.each(["Enter", "Escape", "blur"])("shows the emoji only in the editor, then restores its hover target after %s", action => {
    context.settings.dayNames[iso] = "👋 Test";
    const row = day(null);
    row.find("daymark-margin-name").fire("click");
    const input = row.find("daymark-margin-name-input");
    expect(input.value).toBe("👋 Test");
    expect(row.find("daymark-margin-emoji").hidden).toBe(true);
    expect(row.find("daymark-margin-spine-hit").hidden).toBe(true);
    input.value = "🎬 Changed";
    if (action === "blur") input.fire("blur");
    else input.fire("keydown", { key: action });
    expect(row.find("daymark-margin-emoji").hidden).toBe(false);
    expect(row.find("daymark-margin-emoji").text).toBe(action === "Escape" ? "👋" : "🎬");
    expect(row.find("daymark-margin-spine-hit").hidden).toBe(false);
    expect(row.find("daymark-margin-spine-hit").attrs["aria-label"])
      .toBe(`${action === "Escape" ? "👋 Test" : "🎬 Changed"}\nNo daily note`);
  });
  it("keeps a restored draft free of a duplicate spine emoji", () => {
    context.settings.dayNames[iso] = "👋 Test";
    context.nameEditor.draft = { iso, value: "👋 Still typing", start: 3, end: 3 };
    const row = day();
    expect(row.find("daymark-margin-name-input").value).toBe("👋 Still typing");
    expect(row.find("daymark-margin-emoji").hidden).toBe(true);
    expect(row.find("daymark-margin-spine-hit").hidden).toBe(true);
  });
  it("hides the emoji-only hover target when the name is cleared on a missing-note day", () => {
    context.settings.dayNames[iso] = "👋";
    const row = day(null);
    expect(row.find("daymark-margin-spine-hit").attrs["aria-label"]).toBe("👋\nNo daily note");
    row.fire("contextmenu");
    menuState.menus[0].items[1].action();
    expect(row.find("daymark-margin-spine-hit").hidden).toBe(true);
    expect(row.find("daymark-margin-spine-hit").attrs["aria-label"]).toBe("");
    expect(row.find("daymark-margin-emoji")).toBeUndefined();
    expect(context.onSelect).not.toHaveBeenCalled();
  });
  it("keeps a restored offscreen name button outside the tab order", () => {
    const row = day();
    row.find("daymark-margin-name").fire("click");
    row.find("daymark-margin-date").tabIndex = -1;
    row.find("daymark-margin-name-input").fire("keydown", { key: "Escape" });
    expect(row.find("daymark-margin-name").tabIndex).toBe(-1);
  });
  it("uses an accessible pencil for an unnamed day without placeholder text in the row", () => {
    const row = day(null);
    const button = row.find("daymark-margin-name");
    expect(button.text).toBe("");
    expect(row.find("daymark-margin-name-icon").attrs["aria-hidden"]).toBe("true");
    expect(setIcon).toHaveBeenCalledWith(row.find("daymark-margin-name-icon"), "pencil");
    expect(button.children.find(child => child.id === button.attrs["aria-labelledby"])?.text).toContain("Name day. Thursday");
    button.fire("click");
    expect(row.find("daymark-margin-name-input")).toBeDefined();
    expect(context.onSelect).not.toHaveBeenCalled();
  });
  it.each([record, null])("starts naming with F2 without opening the date", note => {
    const row = day(note);
    expect(row.find("daymark-margin-date").attrs["aria-keyshortcuts"]).toBe("F2");
    row.fire("keydown", { key: "F2" });
    const input = row.find("daymark-margin-name-input");
    expect(input).toBeDefined();
    input.value = "A draft"; input.fire("input");
    row.fire("keydown", { key: "F2" });
    expect(row.find("daymark-margin-name-input")).toBe(input);
    expect(input.value).toBe("A draft");
    expect(context.onSelect).not.toHaveBeenCalled();
    expect(context.onNameChange).not.toHaveBeenCalled();
  });
  it("keeps existing names directly editable without adding a pencil beside them", () => {
    context.settings.dayNames[iso] = "By the sea";
    const row = day();
    expect(row.find("daymark-margin-name").text).toBe("By the sea");
    expect(row.find("daymark-margin-name-icon")).toBeUndefined();
  });
  it.each(["Enter", "blur"])("saves a missing day's name on %s without selecting or creating a note", async action => {
    const row = day(null);
    row.find("daymark-margin-name").fire("click");
    const input = row.find("daymark-margin-name-input");
    input.value = "  Sea   air  ";
    input.fire("input");
    if (action === "blur") input.fire("blur");
    else input.fire("keydown", { key: action });
    input.fire("blur");
    await Promise.resolve();
    expect(context.onNameChange).toHaveBeenCalledExactlyOnceWith(iso, "Sea air");
    expect(context.onSelect).not.toHaveBeenCalled();
    expect(context.nameEditor.draft).toBeNull();
    expect(row.find("daymark-margin-name").text).toBe("Sea air");
    expect(row.find("daymark-margin-mark")).toBeUndefined();
  });
  it("cancels with Escape and keeps the original name", () => {
    context.settings.dayNames[iso] = "Original";
    const row = day();
    row.find("daymark-margin-name").fire("click");
    const input = row.find("daymark-margin-name-input");
    input.value = "Discard";
    input.fire("keydown", { key: "Escape" });
    input.fire("blur");
    expect(context.onNameChange).not.toHaveBeenCalled();
    expect(row.find("daymark-margin-name").text).toBe("Original");
    expect(row.find("daymark-margin-name").focus).toHaveBeenCalled();
  });
  it("clears a name and preserves the draft through a background redraw", () => {
    context.settings.dayNames[iso] = "Original";
    const first = day();
    first.find("daymark-margin-name").fire("click");
    first.find("daymark-margin-name-input").value = "Draft";
    first.find("daymark-margin-name-input").fire("input");
    const replacement = day();
    const input = replacement.find("daymark-margin-name-input");
    expect(input.value).toBe("Draft");
    input.value = " "; input.fire("keydown", { key: "Enter" });
    expect(context.onNameChange).toHaveBeenCalledWith(iso, "");
    expect(replacement.find("daymark-margin-name").classes.has("is-empty")).toBe(true);
  });
  it("does not commit Enter while an IME composition is active", () => {
    const row = day(); row.find("daymark-margin-name").fire("click");
    const input = row.find("daymark-margin-name-input"); input.value = "雨";
    input.fire("keydown", { key: "Enter", isComposing: true });
    expect(context.onNameChange).not.toHaveBeenCalled();
  });
});


describe("Day-name hints and context menu", () => {
  it("shows only clipped names and remeasures after a width change", () => {
    context.settings.dayNames[iso] = "A long walk beside the sea";
    const button = day().find("daymark-margin-name");
    expect(button.attrs["aria-label"]).toBe("");
    button.clientWidth = 80; button.scrollWidth = 180;
    button.fire("mouseover");
    expect(button.attrs["aria-label"]).toBe("A long walk beside the sea");
    expect(setTooltip).toHaveBeenLastCalledWith(button, "A long walk beside the sea", expect.objectContaining({ delay: 650, classes: ["daymark-margin-tooltip", "daymark-margin-name-tooltip"] }));
    button.fire("mouseleave");
    expect(button.attrs["aria-label"]).toBe("");
    button.clientWidth = 200; button.scrollWidth = 200;
    button.fire("mouseover");
    expect(button.attrs["aria-label"]).toBe("");
    button.clientWidth = 80; button.scrollWidth = 180;
    button.fire("focus");
    expect(button.attrs["aria-label"]).toBe("A long walk beside the sea");
    button.clientWidth = 0; button.fire("mouseover");
    expect(button.attrs["aria-label"]).toBe("");
  });
  it("offers only naming on an unnamed day and opens the editor without selecting the note", () => {
    const row = day(null);
    row.fire("contextmenu");
    const menu = menuState.menus[0];
    expect(menu.items.map(item => item.title)).toEqual(["Name day"]);
    expect(menu.positioned).toBe("mouse");
    menu.items[0].action();
    expect(row.find("daymark-margin-name-input")).toBeDefined();
    expect(context.onSelect).not.toHaveBeenCalled();
    expect(context.onNameChange).not.toHaveBeenCalled();
  });
  it("renames without saving until the edit is committed", () => {
    context.settings.dayNames[iso] = "Sea air";
    const row = day(); row.fire("contextmenu");
    expect(menuState.menus[0].items.map(item => item.title)).toEqual(["Rename day", "Clear name"]);
    menuState.menus[0].items[0].action();
    expect(row.find("daymark-margin-name-input").value).toBe("Sea air");
    expect(context.onNameChange).not.toHaveBeenCalled();
  });
  it.each([record, null])("clears only the name, whether a daily note exists or not", async note => {
    context.settings.dayNames[iso] = "Sea air";
    const row = day(note); row.fire("contextmenu");
    menuState.menus[0].items[1].action();
    await Promise.resolve();
    expect(context.onNameChange).toHaveBeenCalledExactlyOnceWith(iso, "");
    expect(context.onSelect).not.toHaveBeenCalled();
    expect(row.find("daymark-margin-name").classes.has("is-empty")).toBe(true);
    expect(row.classes.has("has-note")).toBe(note !== null);
  });
  it("restores the name if clearing cannot be saved", async () => {
    context.settings.dayNames[iso] = "Sea air";
    context.onNameChange = vi.fn(() => Promise.reject(new Error("Cannot write")));
    const row = day(); row.isConnected = true; row.fire("contextmenu");
    menuState.menus[0].items[1].action();
    await Promise.resolve();
    expect(row.find("daymark-margin-name").text).toBe("Sea air");
    expect(Notice).toHaveBeenCalledWith("Could not clear the day name. Please try again.");
  });
  it.each([{ key: "ContextMenu" }, { key: "F10", shiftKey: true }])("opens the menu with $key", keys => {
    const row = day(); row.fire("keydown", keys);
    expect(menuState.menus[0].positioned).toBe("keyboard");
    expect(context.onSelect).not.toHaveBeenCalled();
  });
  it("closes the menu when the calendar rebuilds", () => {
    const row = day(); row.fire("contextmenu");
    expect(context.nameEditor.menu).toBeDefined();
    day();
    expect(context.nameEditor.menu).toBeUndefined();
  });
  it("gives the editor an accessible label without a date tooltip", () => {
    const row = day(); row.find("daymark-margin-name").fire("click");
    const input = row.find("daymark-margin-name-input");
    expect(input.attrs["aria-label"]).toBeUndefined();
    expect(row.all().find(el => el.id === input.attrs["aria-labelledby"])?.text).toBe("Name for Thursday, September 24, 2026");
  });
  it("leaves the native editing menu intact while a draft is active", () => {
    const row = day(); row.find("daymark-margin-name").fire("click");
    const preventDefault = vi.fn();
    row.fire("contextmenu", { preventDefault });
    row.fire("keydown", { key: "ContextMenu", preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(menuState.menus).toHaveLength(0);
  });
});


describe("folded-day disclosure", () => {
  it("announces the date range and expansion state on a single persistent button", () => {
    const parent = new ElementStub(); const toggle = vi.fn();
    const control = createMarginFold(parent.asElement(), {
      start: "2026-09-17", end: "2026-09-19", dates: ["2026-09-17", "2026-09-18", "2026-09-19"]
    }, "en", toggle);
    const button = parent.find("daymark-margin-fold-toggle");
    const title = parent.find("daymark-margin-fold-title");
    control.update(false);
    expect(button.attrs["aria-expanded"]).toBe("false");
    expect(title.textContent).toBe("3 days");
    expect(parent.find("daymark-visually-hidden").textContent).toBe("Unfold 3 days without daily notes, September 17, 2026 to September 19, 2026");
    button.fire("click"); expect(toggle).toHaveBeenCalledOnce();
    control.update(true);
    expect(parent.find("daymark-margin-fold-toggle")).toBe(button);
    expect(button.attrs["aria-expanded"]).toBe("true");
    expect(title.textContent).toBe("3 days");
    expect(parent.find("daymark-visually-hidden").textContent).toBe("Fold 3 days without daily notes, September 17, 2026 to September 19, 2026");
    expect(parent.find("daymark-margin-fold").classes.has("is-expanded")).toBe(true);
  });
  it("reserves all localized weekdays and two-digit dates before unfolding any days", () => {
    const parent = new ElementStub();
    createMarginMonthLabel(parent.asElement(), { year: 2026, month: 9, day: 1 }, "en");
    expect(parent.dataset.gutterLabels.split("\n")).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "28–28"]);
    expect(parent.dataset.gutterNumber).toBe("28");
    const original = parent.dataset.gutterLabels;
    createMarginMonthLabel(parent.asElement(), { year: 2026, month: 10, day: 1 }, "en");
    expect(parent.dataset.gutterLabels).toBe(original);
    createMarginMonthLabel(parent.asElement(), { year: 2026, month: 10, day: 1 }, "ru");
    expect(parent.dataset.gutterLocale).toBe("ru");
    expect(parent.dataset.gutterLabels.split("\n")[0]).toBe("вс");
  });

});
