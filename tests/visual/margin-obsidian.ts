import type { TooltipOptions } from "obsidian";

type Shape = [string, Record<string, string>];

// Browser stand-ins for the Obsidian icons used by this fixture.
const shapes: Record<string, Shape[]> = {
  pencil: [
    ["path", { d: "M21.2 6.8a1 1 0 0 0-4-4L3.9 16.1a2 2 0 0 0-.5.8l-1.2 4a.5.5 0 0 0 .6.6l4-1.2a2 2 0 0 0 .8-.5Z" }],
    ["path", { d: "m15 5 4 4" }]
  ],
  square: [["rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }]],
  "chevron-up": [["path", { d: "m18 15-6-6-6 6" }]],
  "chevron-down": [["path", { d: "m6 9 6 6 6-6" }]],
  "locate-fixed": [
    ["circle", { cx: "12", cy: "12", r: "3" }],
    ["circle", { cx: "12", cy: "12", r: "8" }],
    ["path", { d: "M12 2v2M12 20v2M2 12h2M20 12h2" }]
  ],
  "calendar-clock": [
    ["path", { d: "M8 2v4M16 2v4M3 10h18M21 12V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7" }],
    ["circle", { cx: "17", cy: "18", r: "5" }], ["path", { d: "M17 16v2l1 1" }]
  ],
  "chart-no-axes-column": [
    ["path", { d: "M8 3v18M16 8v13M4 14v7" }]
  ],
  x: [["path", { d: "m18 6-12 12M6 6l12 12" }]],
  image: [
    ["rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }],
    ["circle", { cx: "9", cy: "9", r: "2" }],
    ["path", { d: "m21 15-4-4a2 2 0 0 0-2.8 0L5 21" }]
  ],
  waves: [
    ["path", { d: "M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5s2.5 2 5 2S17 5 19.5 5c1.3 0 1.9.5 2.5 1" }],
    ["path", { d: "M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2c1.3 0 1.9.5 2.5 1" }],
    ["path", { d: "M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2c1.3 0 1.9.5 2.5 1" }]
  ],
  tag: [
    ["path", { d: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8Z" }],
    ["circle", { cx: "7", cy: "7", r: ".5" }]
  ]
};

export function setIcon(element: HTMLElement, icon: string): void {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [name, value] of Object.entries({
    viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true"
  })) svg.setAttribute(name, value);
  for (const [tag, attributes] of shapes[icon] ?? shapes.tag) {
    const shape = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
    svg.append(shape);
  }
  element.dataset.icon = icon;
  element.append(svg);
}

export function setTooltip(element: HTMLElement, text: string, options?: TooltipOptions): void {
  element.setAttr("aria-label", text);
  element.dataset.tooltipDelay = String(options?.delay ?? 0);
  element.dataset.tooltipClasses = options?.classes?.join(" ") ?? "";
}

export class Notice { constructor(message: string) { document.body.dataset.notice = message; } }

// Obsidian's Menu API stand-in; production uses Obsidian's own native menu.
class FixtureMenuItem {
  title = "";
  action: () => void = () => undefined;
  setTitle(title: string): this { this.title = title; return this; }
  setIcon(): this { return this; }
  onClick(action: () => void): this { this.action = action; return this; }
}
export class Menu {
  private parent: HTMLElement = document.body;
  private element: HTMLElement | null = null;
  private abort: AbortController | null = null;
  private readonly items: FixtureMenuItem[] = [];
  private readonly hiddenCallbacks: (() => void)[] = [];
  setParentElement(parent: HTMLElement): this { this.parent = parent; return this; }
  addItem(callback: (item: FixtureMenuItem) => void): this {
    const item = new FixtureMenuItem(); callback(item); this.items.push(item); return this;
  }
  onHide(callback: () => void): void { this.hiddenCallbacks.push(callback); }
  showAtMouseEvent(event: MouseEvent): this { return this.showAtPosition({ x: event.clientX, y: event.clientY }); }
  showAtPosition(position: { x: number; y: number }): this {
    const menu = document.createElement("div");
    menu.className = "fixture-context-menu"; menu.setAttribute("role", "menu");
    menu.style.left = `${position.x}px`; menu.style.top = `${position.y}px`;
    for (const item of this.items) {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = item.title; button.setAttribute("role", "menuitem");
      button.addEventListener("click", () => { this.hide(); item.action(); });
      menu.append(button);
    }
    this.parent.ownerDocument.body.append(menu); this.element = menu;
    this.abort = new AbortController();
    document.addEventListener("pointerdown", event => {
      if (event.target instanceof Node && !menu.contains(event.target)) this.hide();
    }, { signal: this.abort.signal });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); this.hide(); }
    }, { signal: this.abort.signal });
    menu.querySelector<HTMLButtonElement>("button")?.focus();
    return this;
  }
  hide(): this {
    this.abort?.abort(); this.element?.remove(); this.element = null;
    for (const callback of this.hiddenCallbacks) callback();
    return this;
  }
}
