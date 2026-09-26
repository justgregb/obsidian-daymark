import { MarginTimeline, type MarginScrollAnchor } from "../../src/margin-timeline";
import { captureMarginFocus, createMarginHeader, updateMarginHeader } from "../../src/margin-calendar-view";
import { getPeriodBounds, toIsoDate } from "../../src/date";
import { aggregateRecords } from "../../src/aggregate";
import { marginTallyLenses, resolveMarginLens } from "../../src/margin-tally";
import { createMarginTally } from "../../src/margin-tally-view";
import { DEFAULT_SETTINGS, type DailyRecord, type PlainDate, type Weekday } from "../../src/types";
import { checkLinkedCaseLayout, linkedCaseMonth, linkedCaseNames, linkedCaseRecord, linkedCaseToday } from "./margin-linked-cases";

interface ElementOptions { cls?: string; text?: string }

function createElement<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement, tag: K, options?: string | ElementOptions
): HTMLElementTagNameMap[K] {
  // This browser fixture supplies the Obsidian DOM helper itself.
  const element = document.createElement(tag);
  if (typeof options === "string") element.className = options;
  else if (options) {
    if (options.cls) element.className = options.cls;
    if (options.text) element.textContent = options.text;
  }
  parent.append(element);
  return element;
}

Object.assign(HTMLElement.prototype, {
  createEl<K extends keyof HTMLElementTagNameMap>(this: HTMLElement, tag: K, options?: ElementOptions) {
    return createElement(this, tag, options);
  },
  createDiv(this: HTMLElement, options?: string | ElementOptions) { return createElement(this, "div", options); },
  createSpan(this: HTMLElement, options?: string | ElementOptions) { return createElement(this, "span", options); },
  setText(this: HTMLElement, text: string) { this.textContent = text; },
  empty(this: HTMLElement) { this.replaceChildren(); },
  setAttr(this: HTMLElement, key: string, value: string) { this.setAttribute(key, value); },
  toggleClass(this: HTMLElement, name: string, enabled: boolean) { this.classList.toggle(name, enabled); }
});

Object.assign(Node.prototype, {
  createSvg<K extends keyof SVGElementTagNameMap>(this: Node, tag: K, options?: SvgElementInfo | string) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    const cls = typeof options === "string" ? options : options?.cls;
    if (cls) element.setAttribute("class", Array.isArray(cls) ? cls.join(" ") : cls);
    if (typeof options === "object") for (const [key, value] of Object.entries(options.attr ?? {})) {
      if (value !== null) element.setAttribute(key, String(value));
    }
    this.appendChild(element);
    return element;
  }
});

const host = document.getElementById("margin-fixtures");
if (!host) throw new Error("Missing fixture host");
const params = new URLSearchParams(location.search);
const locale = params.get("locale") || "en";
if (params.has("large")) {
  for (const [name, size] of [["large", 22], ["medium", 20], ["small", 18], ["smaller", 17]] as const) {
    document.documentElement.style.setProperty(`--font-ui-${name}`, `${size}px`);
  }
}
if (params.has("mobile")) {
  document.body.classList.add("is-mobile");
  // Preview the production touch rules even in a desktop browser. The body
  // class alone does not activate pointer media queries.
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (rule instanceof CSSMediaRule) {
        if (rule.conditionText === "(pointer: coarse)") rule.media.mediaText = "all";
        else if (rule.conditionText === "(hover: hover) and (pointer: fine)") rule.media.mediaText = "not all";
      }
    }
  }
}
const widths = params.has("width") ? [Number(params.get("width"))] : [200, 285, 320];
const themes = params.has("theme") ? [params.get("theme")!] : ["light", "dark"];
for (const width of widths) {
  for (const theme of themes) {
    const fixture = host.createEl("section", { cls: `margin-fixture theme-${theme}` });
    fixture.style.width = `${width}px`;
    fixture.dataset.width = String(width);
    fixture.dataset.theme = theme;
    fixture.createEl("p", { cls: "fixture-label", text: `${width}px · ${theme}` });
    const container = fixture.createDiv("workspace-leaf-content daymark-calendar-container");
    const root = container.createDiv("view-content daymark-calendar-view is-margin-view is-month-view");
    const output = fixture.createEl("output");
    output.setAttr("aria-live", "polite");
    let month: PlainDate = params.has("linked") ? linkedCaseMonth : { year: params.has("quiet") ? 2020 : 2026, month: 9, day: 1 };
    let selectedIso = params.has("linked") ? "2024-06-02" : "2026-09-17";
    const todayIso = params.has("linked") ? linkedCaseToday : "2026-09-20";
    let timeline: MarginTimeline | null = null;
    let scrollAnchor: MarginScrollAnchor | null = null;
    let disposeTally: (() => void) | null = null;
    let lensId: string | null = null;
    let expanded = false;
    const nameEditor = { draft: null };
    const expandedLinks = new Set<string>();
    const expandedFoldDates = new Set<string>();
    const settings = {
      ...DEFAULT_SETTINGS,
      calendarLayout: "margin" as const,
      highlightedWeekdays: [0, 6] as Weekday[],
      dayNames: { "2026-09-03": "By the water", "2026-09-07": "Back to work", "2026-09-16": "👩🏽‍🚀 Space day", "2026-09-17": "🎬 Movie night", "2026-09-18": "🎮 A new game", "2026-09-19": "📖 A chapter done", "2026-09-20": "👋" } as Record<string, string>,
      tallyTagLabels: { swimming: "Swim sessions" }
    };
    if (params.has("quiet")) settings.dayNames = {};
    if (params.has("linked")) settings.dayNames = { ...linkedCaseNames };
    const recordForDate = (date: PlainDate): DailyRecord | null => {
      if (params.has("linked")) return linkedCaseRecord(date);
      if (params.has("quiet")) return null;
      if ((date.day >= 8 && date.day <= 13) || date.day % 3 === 0 || date.day > 20) return null;
      return {
        path: `Journal/${toIsoDate(date)}.md`, basename: toIsoDate(date), date,
        isoDate: toIsoDate(date), words: [0, 45, 160, 680, 1900][date.day % 5], photos: date.day % 2 === 0 ? 2 : 0,
        linkedWords: date.day === 14 ? 1400 : date.day === 19 ? 300 : 0,
        linkedNoteCount: date.day === 14 ? 2 : date.day === 19 ? 1 : 0,
        linkedNotes: date.day === 14 ? [{ path: "Desk/First draft.md", title: "First draft" }, { path: "Desk/Research.md", title: "Research" }]
          : date.day === 19 ? [{ path: "Books/Dune.md", title: "Dune" }] : [],
        totalCheckboxes: 1, completedCheckboxes: 1,
        taggedValues: date.day % 5 === 0 || date.day === 8 ? [{ tag: "swimming", value: date.day === 8 ? 0 : date.day % 3 + 1 }] : []
      };
    };
    const selectDate = (date: PlainDate, align: "nearest" | "center" = "nearest", openNote = true): void => {
      root.querySelector(`[data-date="${selectedIso}"]`)?.classList.remove("is-selected");
      root.querySelector(`[data-date="${selectedIso}"] .daymark-margin-date`)?.setAttribute("aria-pressed", "false");
      selectedIso = toIsoDate(date);
      timeline?.scrollToDate(date, align);
      root.querySelector(`[data-date="${selectedIso}"]`)?.classList.add("is-selected");
      root.querySelector(`[data-date="${selectedIso}"] .daymark-margin-date`)?.setAttribute("aria-pressed", "true");
      output.textContent = openNote ? `${recordForDate(date) ? "Open" : "Confirm creation"} ${selectedIso}` : `Located ${selectedIso}`;
    };
    const lensesForMonth = (month: PlainDate) => {
      const records = Array.from({ length: new Date(Date.UTC(month.year, month.month, 0)).getUTCDate() }, (_, index) => ({ ...month, day: index + 1 })).flatMap(date => {
        const record = date && recordForDate(date);
        return record ? [record] : [];
      });
      return marginTallyLenses(aggregateRecords(records, getPeriodBounds(month, "month", 1)), settings, locale);
    };
    const render = (): void => {
      const restoreFocus = captureMarginFocus(root);
      scrollAnchor = timeline?.snapshot() ?? scrollAnchor;
      timeline?.dispose();
      disposeTally?.();
      root.replaceChildren();
      const tallySlot = createMarginHeader(root, month, locale, {
        onToday: () => selectDate(params.has("linked") ? { ...linkedCaseMonth, day: 7 } : { year: 2026, month: 9, day: 20 }, "center", false)
      });
      const refreshHeader = (): void => {
        updateMarginHeader(root, month, locale);
        disposeTally?.();
        tallySlot.replaceChildren();
        const lenses = lensesForMonth(month);
        const lens = resolveMarginLens(lensId, lenses, settings, locale);
        disposeTally = createMarginTally(tallySlot, {
          locale, period: `${month.year}-${String(month.month).padStart(2, "0")}`, lenses: () => lenses, lens, expanded,
          onExpanded: value => { expanded = value; },
          onLens: id => { lensId = id; expanded = false; render(); root.querySelector<HTMLElement>(".daymark-margin-tally-toggle")?.focus({ preventScroll: true }); },
          reportAction: () => undefined, additionalWords: () => undefined
        });
      };
      refreshHeader();
      const body = root.createDiv("daymark-calendar-body");
      timeline = new MarginTimeline(body, {
        anchor: scrollAnchor ?? { date: toIsoDate(month), fraction: 0 }, recordForDate, expandedFoldDates,
        contextForMonth: month => ({
          locale, settings, selectedIso, todayIso,
          nameEditor, expandedLinks, lens: resolveMarginLens(lensId, lensesForMonth(month), settings, locale),
          onOpenLinkedNote: async path => { output.textContent = `Open linked note: ${path}`; },
          onNameChange: (iso, name) => {
            if (name) settings.dayNames[iso] = name;
            else delete settings.dayNames[iso];
            output.textContent = `Named ${iso}: ${name || "(cleared)"}`;
            return Promise.resolve().then(() => render());
          },
          onSelect: selectDate
        }),
        onScroll: (anchor, date) => {
          scrollAnchor = anchor;
          if (date.month === month.month && date.year === month.year) return;
          month = { ...date, day: 1 };
          refreshHeader();
        }
      });
      restoreFocus();
    };
    render();
    if (params.has("linked")) window.requestAnimationFrame(() => {
      const failures = checkLinkedCaseLayout(root, params.has("mobile") && !params.has("large"));
      output.dataset.layoutCheck = failures.length ? "fail" : "pass";
      output.textContent = failures.length ? failures.join("; ") : "Layout checks passed · 8 cases";
    });
  }
}
