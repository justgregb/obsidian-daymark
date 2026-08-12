import { ItemView, Notice, setIcon, TFile, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { additionalWordFolderLabel } from "./additional-word-index";
import {
  dateIsWithin,
  formatPeriodTitle,
  getPeriodBounds,
  parseIsoDate,
  shiftAnchor,
  todayPlainDate,
  toIsoDate
} from "./date";
import { formatTagLabel } from "./format";
import { openInNewTab } from "./open-summary";
import type DaymarkPlugin from "./main";
import type { SavedSummaryState } from "./saved-summary";
import type { PeriodAggregate, PeriodMode, PlainDate } from "./types";

export const TALLY_VIEW_TYPE = "tally-journal-view";

interface SavedViewState {
  mode?: unknown;
  anchorDate?: unknown;
}

export class TallyView extends ItemView {
  private mode: PeriodMode = "week";
  private anchorDate: PlainDate = todayPlainDate();
  private unsubscribe: (() => void) | null = null;
  private opened = false;
  private renderVersion = 0;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: DaymarkPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return TALLY_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Tally";
  }

  override getIcon(): string {
    return "list-checks";
  }

  override getState(): Record<string, unknown> {
    return { mode: this.mode, anchorDate: toIsoDate(this.anchorDate) };
  }

  override async setState(state: SavedViewState, result: ViewStateResult): Promise<void> {
    if (state.mode === "week" || state.mode === "month" || state.mode === "year") this.mode = state.mode;
    if (typeof state.anchorDate === "string") {
      const parsed = parseIsoDate(state.anchorDate);
      if (parsed) this.anchorDate = parsed;
    }
    await super.setState(state, result);
    if (this.opened) this.render();
  }

  override async onOpen(): Promise<void> {
    this.opened = true;
    this.unsubscribe = this.plugin.subscribe(() => {
      this.render();
    });
    this.renderLoading();
    try {
      await this.plugin.ensureTallyReady();
      this.render();
    } catch (error) {
      this.renderError(error);
    }
  }

  override async onClose(): Promise<void> {
    this.opened = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private renderLoading(): void {
    this.contentEl.empty();
    this.contentEl.addClass("tally-view");
    this.contentEl.createEl("p", { cls: "tally-status", text: "Building Tally index…" });
  }

  private renderError(error: unknown): void {
    this.contentEl.empty();
    this.contentEl.addClass("tally-view");
    this.contentEl.createEl("p", {
      cls: "tally-error",
      text: error instanceof Error ? error.message : "Tally could not read the journal."
    });
  }

  private render(): void {
    if (!this.opened) return;
    const renderVersion = ++this.renderVersion;
    const weekStart = this.plugin.resolveWeekStart();
    const bounds = getPeriodBounds(this.anchorDate, this.mode, weekStart);
    const aggregate = this.plugin.index.aggregate(bounds);

    const root = this.contentEl;
    root.empty();
    root.addClass("tally-view");

    this.createHeader(root, aggregate, renderVersion);

    const summary = root.createDiv("tally-summary");
    if (aggregate.noteCount === 0) {
      summary.createEl("p", { cls: "tally-empty", text: "Nothing to tally in this period." });
    } else {
      this.createMetric(summary, "Daily notes", aggregate.noteCount);
      this.createMetric(summary, "Words", aggregate.words);
      if (aggregate.completedCheckboxes > 0) {
        this.createMetric(summary, "Checked items", aggregate.completedCheckboxes);
      }
      for (const tag of aggregate.tags) {
        this.createMetric(summary, formatTagLabel(tag.tag, this.plugin.locale), tag.total);
      }
    }
    this.createAdditionalWordSummary(summary);
  }

  private createHeader(parent: HTMLElement, aggregate: PeriodAggregate, renderVersion: number): void {
    const header = parent.createDiv("tally-header");
    const title = header.createDiv("tally-period-title");
    title.createEl("span", { text: formatPeriodTitle(aggregate.bounds, this.mode, this.plugin.locale) });
    const controls = header.createDiv("tally-header-controls");
    this.createModeButton(controls);
    this.createNavButton(controls, "chevron-left", "Previous period", -1);
    this.createCurrentPeriodButton(controls, dateIsWithin(todayPlainDate(), aggregate.bounds));
    this.createNavButton(controls, "chevron-right", "Next period", 1);
    this.createSaveButton(controls, aggregate, renderVersion);
  }

  private createCurrentPeriodButton(parent: HTMLElement, current: boolean): void {
    const button = parent.createEl("button", { cls: "clickable-icon tally-current-period-button" });
    button.setAttr("aria-label", current ? `Current ${this.mode}` : `Go to current ${this.mode}`);
    button.disabled = current;
    setIcon(button, "calendar-clock");
    button.addEventListener("click", () => {
      this.anchorDate = todayPlainDate();
      this.saveViewState();
      this.render();
    });
  }

  private createModeButton(parent: HTMLElement): void {
    const icons: Record<PeriodMode, string> = {
      week: "calendar-range",
      month: "calendar-days",
      year: "calendar"
    };
    const nextModes: Record<PeriodMode, PeriodMode> = {
      week: "month",
      month: "year",
      year: "week"
    };
    const nextMode = nextModes[this.mode];
    const button = parent.createEl("button", { cls: "clickable-icon tally-mode-toggle" });
    button.setAttr("aria-label", `Show ${nextMode} view`);
    setIcon(button, icons[nextMode]);
    button.addEventListener("click", () => {
      this.mode = nextMode;
      this.saveViewState();
      this.render();
    });
  }

  private createSaveButton(parent: HTMLElement, aggregate: PeriodAggregate, renderVersion: number): void {
    const save = parent.createEl("button", { cls: "clickable-icon tally-header-save" });
    setIcon(save, "save");
    save.disabled = aggregate.noteCount === 0;
    save.setAttr("aria-label", save.disabled
      ? "Save unavailable: no daily notes in this period"
      : "Save this period");
    save.addEventListener("click", () => {
      void this.saveSummary();
    });
    if (aggregate.noteCount > 0) {
      void this.plugin.summaryState(this.mode, aggregate).then((state) => {
        if (!this.opened || renderVersion !== this.renderVersion || !save.isConnected) return;
        this.applySummaryState(save, state);
      }).catch((error: unknown) => {
        console.error("Tally could not determine the saved summary state.", error);
      });
    }
  }

  private applySummaryState(button: HTMLButtonElement, state: SavedSummaryState): void {
    setIcon(button, state === "saved" ? "check" : "save");
    button.toggleClass("is-saved", state === "saved");
    button.disabled = state === "saved";
    button.setAttr("aria-label", state === "saved"
      ? "This period is saved"
      : state === "update" ? "Save changes to this period" : "Save this period");
  }

  private createNavButton(parent: HTMLElement, icon: string, label: string, amount: number): void {
    const button = parent.createEl("button", { cls: "clickable-icon tally-nav-button" });
    button.setAttr("aria-label", label);
    setIcon(button, icon);
    button.addEventListener("click", () => {
      this.anchorDate = shiftAnchor(this.anchorDate, this.mode, amount);
      this.saveViewState();
      this.render();
    });
  }

  private createMetric(parent: HTMLElement, label: string, total: number): void {
    const metric = parent.createDiv("tally-metric");
    metric.createEl("span", { cls: "tally-metric-label", text: label });
    metric.createEl("span", { cls: "tally-metric-value", text: this.formatNumber(total) });
  }

  private createAdditionalWordSummary(parent: HTMLElement): void {
    const folder = this.plugin.settings.additionalWordFolder;
    if (folder.length === 0) return;
    const section = parent.createDiv("tally-additional-word-source");
    section.createDiv({
      cls: "tally-additional-word-source-title",
      text: `${additionalWordFolderLabel(folder)} · All time`
    });
    this.createMetric(section, "Words", this.plugin.additionalWordIndex.totalWords);
  }

  private saveViewState(): void {
    void this.app.workspace.requestSaveLayout();
  }

  showPeriod(mode: "week" | "month", anchorDate: PlainDate): void {
    this.mode = mode;
    this.anchorDate = anchorDate;
    this.saveViewState();
    this.render();
  }

  async saveCurrentPeriod(): Promise<void> {
    this.anchorDate = todayPlainDate();
    this.saveViewState();
    await this.plugin.ensureTallyReady();
    this.render();
    await this.saveSummary();
  }

  private async saveSummary(): Promise<void> {
    const bounds = getPeriodBounds(this.anchorDate, this.mode, this.plugin.resolveWeekStart());
    const aggregate = this.plugin.index.aggregate(bounds);
    if (aggregate.noteCount === 0) {
      new Notice("No daily notes to save for this period.");
      return;
    }
    try {
      const path = await this.plugin.saveSummary(this.mode, aggregate);
      if (path) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error(`Tally saved ${path}, but could not open it.`);
        await openInNewTab(file, () => this.app.workspace.getLeaf("tab"));
        new Notice(`Tally saved to ${path}.`);
        this.render();
      }
    } catch (error) {
      console.error("Tally could not save the selected period.", error);
      new Notice(error instanceof Error ? error.message : "Tally could not save the selected period.");
    }
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat(this.plugin.locale, { maximumFractionDigits: 3 }).format(value);
  }
}
