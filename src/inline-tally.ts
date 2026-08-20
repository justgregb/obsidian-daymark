import { Notice, setIcon, TFile } from "obsidian";
import { additionalWordFolderLabel } from "./additional-word-index";
import { periodDayCount } from "./calendar-summary";
import { resolveTagLabel, resolveTallyMetricLabel, sortByResolvedTagLabel } from "./format";
import { numberFormatter } from "./intl-cache";
import { openInNewTab } from "./open-summary";
import type DaymarkPlugin from "./main";
import type { SavedSummaryState } from "./saved-summary";
import { summaryActionPresentation } from "./summary-action";
import type { PeriodAggregate, PeriodMode } from "./types";

export class InlineTally {
  private actionPending = false;
  private formatterLocale: string | null = null;
  private numberFormatter!: Intl.NumberFormat;

  constructor(
    private readonly plugin: DaymarkPlugin,
    private readonly rerender: () => void
  ) {}

  createMetrics(parent: HTMLElement, aggregate: PeriodAggregate): void {
    if (aggregate.noteCount === 0) {
      parent.createEl("p", { cls: "daymark-tally-empty", text: "No activity in this period." });
    } else {
      const metrics = parent.createDiv("daymark-tally-metrics");
      const metricLabels = this.plugin.settings.tallyMetricLabels;
      this.createMetric(
        metrics,
        resolveTallyMetricLabel("dailyNotes", metricLabels),
        `${this.formatNumber(aggregate.noteCount)} / ${this.formatNumber(periodDayCount(aggregate.bounds))}`
      );
      this.createMetric(metrics, resolveTallyMetricLabel("words", metricLabels), aggregate.words);
      this.createMetric(metrics, resolveTallyMetricLabel("photos", metricLabels), aggregate.photos);
      if (aggregate.totalCheckboxes > 0) {
        this.createMetric(
          metrics,
          "Checked items",
          `${this.formatNumber(aggregate.completedCheckboxes)} / ${this.formatNumber(aggregate.totalCheckboxes)}`
        );
      }
      const labels = this.plugin.settings.tallyTagLabels;
      const tags = sortByResolvedTagLabel(aggregate.tags, labels, this.plugin.locale);
      for (const [index, tag] of tags.entries()) {
        this.createMetric(
          metrics,
          resolveTagLabel(tag.tag, labels, this.plugin.locale),
          tag.total,
          index === 0 ? "daymark-tally-tag-start" : undefined
        );
      }
    }

    const folder = this.plugin.settings.additionalWordFolder;
    if (folder.length === 0) return;
    const words = this.plugin.additionalWordIndex.totalWords;
    this.createMetric(
      parent,
      `${additionalWordFolderLabel(folder)} · All time`,
      `${this.formatNumber(words)} ${words === 1 ? "word" : "words"}`,
      "daymark-tally-additional-source"
    );
  }

  createReportAction(
    parent: HTMLElement,
    mode: PeriodMode,
    aggregate: PeriodAggregate,
    renderVersion: number,
    isCurrentRender: (version: number) => boolean
  ): void {
    const button = parent.createEl("button", { cls: "daymark-tally-report-action" });
    button.setAttr("type", "button");
    const icon = button.createSpan("daymark-tally-report-icon");
    const label = button.createSpan("daymark-tally-report-label");
    this.applyPresentation(button, icon, label, aggregate.noteCount, "save");
    button.addEventListener("click", () => {
      void this.performAction(button, mode, aggregate);
    });

    if (aggregate.noteCount === 0) return;
    void this.plugin.summaryState(mode, aggregate).then((state) => {
      if (!isCurrentRender(renderVersion) || !button.isConnected) return;
      this.applyPresentation(button, icon, label, aggregate.noteCount, state);
    }).catch((error: unknown) => {
      console.error("Daymark could not determine the saved Tally report state.", error);
    });
  }

  async savePeriod(mode: PeriodMode, aggregate: PeriodAggregate): Promise<void> {
    await this.saveAndOpen(mode, aggregate);
  }

  private createMetric(
    parent: HTMLElement,
    label: string,
    value: number | string,
    className?: string
  ): void {
    const metric = parent.createDiv("daymark-tally-metric");
    if (className) metric.addClass(className);
    metric.createSpan({ cls: "daymark-tally-metric-label", text: label });
    metric.createSpan({
      cls: "daymark-tally-metric-value",
      text: typeof value === "number" ? this.formatNumber(value) : value
    });
  }

  private applyPresentation(
    button: HTMLButtonElement,
    icon: HTMLSpanElement,
    label: HTMLSpanElement,
    noteCount: number,
    state: SavedSummaryState
  ): void {
    const presentation = summaryActionPresentation(noteCount, state);
    setIcon(icon, presentation.icon);
    label.setText(presentation.label);
    button.toggleClass("is-open", presentation.intent === "open");
    button.disabled = presentation.disabled;
    button.setAttr("aria-label", presentation.ariaLabel);
  }

  private async performAction(
    button: HTMLButtonElement,
    mode: PeriodMode,
    renderedAggregate: PeriodAggregate
  ): Promise<void> {
    if (this.actionPending || button.disabled) return;
    this.actionPending = true;
    button.setAttr("aria-busy", "true");
    try {
      const aggregate = this.plugin.index.aggregate(renderedAggregate.bounds);
      if (aggregate.noteCount === 0) {
        new Notice("No daily notes to save for this period.");
        return;
      }
      const state = await this.plugin.summaryState(mode, aggregate);
      if (state === "saved") await this.openSaved(mode, aggregate);
      else await this.saveAndOpen(mode, aggregate);
    } catch (error) {
      console.error("Daymark could not complete the Tally report action.", error);
      new Notice(error instanceof Error ? error.message : "Daymark could not complete the Tally report action.");
    } finally {
      this.actionPending = false;
      if (button.isConnected) button.removeAttribute("aria-busy");
    }
  }

  private async saveAndOpen(mode: PeriodMode, aggregate: PeriodAggregate): Promise<void> {
    if (aggregate.noteCount === 0) {
      new Notice("No daily notes to save for this period.");
      return;
    }
    try {
      const path = await this.plugin.saveSummary(mode, aggregate);
      if (!path) return;
      const file = this.plugin.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) throw new Error(`Tally saved ${path}, but could not open it.`);
      await openInNewTab(file, () => this.plugin.app.workspace.getLeaf("tab"));
      new Notice(`Tally saved to ${path}.`);
      this.rerender();
    } catch (error) {
      console.error("Daymark could not save the selected Tally period.", error);
      new Notice(error instanceof Error ? error.message : "Daymark could not save the selected Tally period.");
    }
  }

  private async openSaved(mode: PeriodMode, aggregate: PeriodAggregate): Promise<void> {
    const path = this.plugin.summaryPath(mode, aggregate);
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice("The saved Tally report could not be found. Save this period again to recreate it.");
      this.rerender();
      return;
    }
    await openInNewTab(file, () => this.plugin.app.workspace.getLeaf("tab"));
  }

  private formatNumber(value: number): string {
    const locale = this.plugin.locale;
    if (this.formatterLocale !== locale) {
      this.formatterLocale = locale;
      this.numberFormatter = numberFormatter(locale, { maximumFractionDigits: 3 });
    }
    return this.numberFormatter.format(value);
  }
}
