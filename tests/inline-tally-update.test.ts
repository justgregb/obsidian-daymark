import { describe, expect, it, vi } from "vitest";
import { InlineTally } from "../src/inline-tally";
import { aggregateRecords } from "../src/aggregate";
import { getPeriodBounds } from "../src/date";
import { DEFAULT_SETTINGS, type PeriodAggregate, type PeriodMode } from "../src/types";
import type DaymarkPlugin from "../src/main";
import type { SavedSummaryState } from "../src/saved-summary";

vi.mock("obsidian", () => ({ Notice: vi.fn(), setIcon: vi.fn(), TFile: class {} }));
class Element extends EventTarget {
  children: Element[] = [];
  classes = new Set<string>();
  attrs: Record<string, string> = {};
  textContent = "";
  isConnected = true;
  disabled = false;
  private appendElement(options: string | { cls?: string; text?: string } = ""): Element {
    const child = new Element();
    child.classes = new Set((typeof options === "string" ? options : options.cls)?.split(" "));
    child.textContent = typeof options === "object" ? options.text ?? "" : "";
    this.children.push(child); return child;
  }
  createEl(_tag: string, options?: string | { cls?: string; text?: string }): Element { return this.appendElement(options); }
  createSpan(options?: string | { cls?: string; text?: string }): Element { return this.appendElement(options); }
  createDiv(options?: string): Element { return this.appendElement(options); }
  all(): Element[] { return [this, ...this.children.flatMap(child => child.all())]; }
  querySelector(selector: string): Element | null { return this.all().find(item => item.classes.has(selector.slice(1))) ?? null; }
  setText(value: string): void { this.textContent = value; }
  setAttr(name: string, value: string): void { this.attrs[name] = value; }
  toggleClass(name: string, enabled: boolean): void { if (enabled) this.classes.add(name); else this.classes.delete(name); }
  addClass(name: string): void { this.classes.add(name); }
}
function aggregate(month: number): PeriodAggregate {
  return { ...aggregateRecords([], getPeriodBounds({ year: 2026, month, day: 1 }, "month", 1)), noteCount: 1 };
}
describe("stable Tally report and additional-writing controls", () => {
  it("uses the latest period on click and discards an older async report state", async () => {
    const releases: Array<(state: SavedSummaryState) => void> = [];
    const plugin = { summaryState: vi.fn(() => new Promise<SavedSummaryState>(resolve => releases.push(resolve))) };
    const tally = new InlineTally(plugin as unknown as DaymarkPlugin, vi.fn());
    const action = vi.spyOn(tally as unknown as { performAction: (button: HTMLButtonElement, mode: PeriodMode, aggregate: PeriodAggregate) => Promise<void> }, "performAction").mockResolvedValue();
    const parent = new Element(); const first = aggregate(9); const second = aggregate(10);
    tally.createReportAction(parent as unknown as HTMLElement, "month", first, 1, () => true);
    const button = parent.children[0];
    tally.createReportAction(parent as unknown as HTMLElement, "month", second, 2, () => true);
    expect(parent.children).toEqual([button]);
    releases[1]("saved"); await Promise.resolve();
    expect(button.querySelector(".daymark-tally-report-label")!.textContent).toBe("Report");
    releases[0]("save"); await Promise.resolve();
    expect(button.querySelector(".daymark-tally-report-label")!.textContent).toBe("Report");
    button.dispatchEvent(new Event("click"));
    expect(action).toHaveBeenCalledExactlyOnceWith(button, "month", second);
  });
  it("updates additional-folder loading and word totals in the same metric", () => {
    const plugin = { locale: "en", settings: { ...DEFAULT_SETTINGS, additionalWordFolder: "Desk/Essays" }, additionalWordIndex: { isReady: false, totalWords: 0 } };
    const tally = new InlineTally(plugin as unknown as DaymarkPlugin, vi.fn());
    const parent = new Element();
    tally.createAdditionalWords(parent as unknown as HTMLElement);
    const metric = parent.children[0];
    expect(metric.querySelector(".daymark-tally-metric-value")!.textContent).toBe("Loading…");
    plugin.additionalWordIndex = { isReady: true, totalWords: 23 };
    tally.createAdditionalWords(parent as unknown as HTMLElement);
    expect(parent.children).toEqual([metric]);
    expect(metric.querySelector(".daymark-tally-metric-value")!.textContent).toBe("23 words");
  });
});
