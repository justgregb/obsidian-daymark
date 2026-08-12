import { ItemView, setIcon, TFile, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { calendarGridDates, calendarWeekDates, calendarWeekdays } from "./calendar-grid";
import { isSupportedCoverPath } from "./cover";
import {
  getPeriodBounds,
  formatPeriodTitle,
  parseIsoDate,
  shiftAnchor,
  todayPlainDate,
  toDate,
  toIsoDate
} from "./date";
import type DaymarkPlugin from "./main";
import type { DailyRecord, PlainDate, Weekday } from "./types";

export const DAYMARK_CALENDAR_VIEW_TYPE = "daymark-calendar-view";
let calendarViewSequence = 0;

interface CalendarViewState {
  mode?: unknown;
  month?: unknown;
  selectedDate?: unknown;
}

type CalendarViewMode = "month" | "week";

function firstOfMonth(date: PlainDate): PlainDate {
  return { year: date.year, month: date.month, day: 1 };
}

export class DaymarkCalendarView extends ItemView {
  private readonly accessibleId = `daymark-calendar-${++calendarViewSequence}`;
  private mode: CalendarViewMode = "month";
  private displayedMonth = firstOfMonth(todayPlainDate());
  private selectedDate = todayPlainDate();
  private unsubscribe: (() => void) | null = null;
  private opened = false;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: DaymarkPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return DAYMARK_CALENDAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Daymark";
  }

  override getIcon(): string {
    return "calendar-days";
  }

  override getState(): Record<string, unknown> {
    return {
      mode: this.mode,
      month: toIsoDate(this.displayedMonth),
      selectedDate: toIsoDate(this.selectedDate)
    };
  }

  override async setState(state: CalendarViewState, result: ViewStateResult): Promise<void> {
    if (state.mode === "month" || state.mode === "week") this.mode = state.mode;
    if (typeof state.month === "string") {
      const month = parseIsoDate(state.month);
      if (month) this.displayedMonth = firstOfMonth(month);
    }
    if (typeof state.selectedDate === "string") {
      const selected = parseIsoDate(state.selectedDate);
      if (selected) this.selectedDate = selected;
    }
    await super.setState(state, result);
    if (this.opened) this.render();
  }

  override async onOpen(): Promise<void> {
    this.opened = true;
    this.unsubscribe = this.plugin.subscribe(() => this.render());
    this.registerEvent(this.app.workspace.on("file-open", (file) => this.syncToFile(file)));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      const record = this.plugin.index.recordForDate(this.selectedDate);
      if (record?.path === file.path) this.render();
    }));
    this.renderLoading();
    try {
      await this.plugin.index.ensureReady();
      this.syncToFile(this.app.workspace.getActiveFile(), false);
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
    this.contentEl.addClass("daymark-calendar-view");
    this.contentEl.removeClass("has-footer");
    this.contentEl.createEl("p", { cls: "daymark-calendar-status", text: "Building journal index…" });
  }

  private renderError(error: unknown): void {
    this.contentEl.empty();
    this.contentEl.addClass("daymark-calendar-view");
    this.contentEl.removeClass("has-footer");
    this.contentEl.createEl("p", {
      cls: "daymark-calendar-error",
      text: error instanceof Error ? error.message : "Daymark could not read the journal."
    });
  }

  private render(): void {
    if (!this.opened) return;
    const weekStart = this.plugin.resolveWeekStart();
    const anchor = this.mode === "month" ? this.displayedMonth : this.selectedDate;
    const bounds = getPeriodBounds(anchor, this.mode, weekStart);
    const root = this.contentEl;
    root.empty();
    root.addClass("daymark-calendar-view");
    root.toggleClass("is-week-view", this.mode === "week");
    root.toggleClass("has-footer", this.plugin.settings.showSelectedDayStats || this.plugin.settings.tallyEnabled);

    this.createHeader(root, bounds);
    const body = root.createDiv("daymark-calendar-body");
    if (this.mode === "month") {
      this.createWeekdays(body, weekStart);
      this.createGrid(body, weekStart);
    } else {
      this.createWeekList(body, weekStart);
    }
    this.createFooter(root, bounds);
  }

  private createHeader(parent: HTMLElement, bounds: ReturnType<typeof getPeriodBounds>): void {
    const header = parent.createDiv("daymark-calendar-header");
    const title = header.createDiv("daymark-calendar-title");
    title.setText(this.mode === "month"
      ? new Intl.DateTimeFormat(this.plugin.locale, {
        month: "short",
        year: "numeric",
        timeZone: "UTC"
      }).format(toDate(bounds.start))
      : formatPeriodTitle(bounds, "week", this.plugin.locale));
    const controls = header.createDiv("daymark-calendar-header-controls");
    const targetMode: CalendarViewMode = this.mode === "month" ? "week" : "month";
    const modeToggle = controls.createEl("button", {
      cls: "clickable-icon daymark-calendar-mode-toggle"
    });
    modeToggle.setAttr("aria-label", `Show ${targetMode} view`);
    setIcon(modeToggle, targetMode === "week" ? "calendar-range" : "calendar-days");
    modeToggle.addEventListener("click", () => this.setMode(targetMode));
    this.createNavigationButton(controls, "chevron-left", `Previous ${this.mode}`, -1);
    const today = controls.createEl("button", { cls: "daymark-calendar-today" });
    today.setAttr("aria-label", "Today");
    const todayIcon = today.createSpan("daymark-calendar-today-icon");
    setIcon(todayIcon, "calendar-clock");
    today.createSpan({ cls: "daymark-calendar-today-label", text: "Today" });
    today.addEventListener("click", () => {
      const current = todayPlainDate();
      this.displayedMonth = firstOfMonth(current);
      this.selectedDate = current;
      this.saveViewState();
      this.render();
    });
    this.createNavigationButton(controls, "chevron-right", `Next ${this.mode}`, 1);
  }

  private setMode(mode: CalendarViewMode): void {
    if (this.mode === mode) return;
    if (mode === "week" && !this.dateIsInDisplayedMonth(this.selectedDate)) {
      this.selectedDate = this.displayedMonth;
    }
    if (mode === "month") this.displayedMonth = firstOfMonth(this.selectedDate);
    this.mode = mode;
    this.saveViewState();
    this.render();
  }

  private createNavigationButton(parent: HTMLElement, iconName: string, label: string, amount: number): void {
    const button = parent.createEl("button", { cls: "clickable-icon daymark-calendar-nav" });
    button.setAttr("aria-label", label);
    setIcon(button, iconName);
    button.addEventListener("click", () => {
      if (this.mode === "week") {
        this.selectedDate = shiftAnchor(this.selectedDate, "week", amount);
        this.displayedMonth = firstOfMonth(this.selectedDate);
      } else {
        const selectionAnchor = this.dateIsInDisplayedMonth(this.selectedDate)
          ? this.selectedDate
          : this.displayedMonth;
        this.selectedDate = shiftAnchor(selectionAnchor, "month", amount);
        this.displayedMonth = firstOfMonth(this.selectedDate);
      }
      this.saveViewState();
      this.render();
    });
  }

  private createWeekdays(parent: HTMLElement, weekStart: Weekday): void {
    const weekdays = parent.createDiv("daymark-calendar-weekdays");
    for (const weekday of calendarWeekdays(weekStart)) {
      const sample = new Date(Date.UTC(2026, 0, 4 + weekday));
      weekdays.createEl("span", {
        text: new Intl.DateTimeFormat(this.plugin.locale, { weekday: "short", timeZone: "UTC" })
          .format(sample)
          .toLocaleUpperCase(this.plugin.locale)
      });
    }
  }

  private createGrid(parent: HTMLElement, weekStart: Weekday): void {
    const grid = parent.createDiv("daymark-calendar-grid");
    grid.setAttr("role", "grid");
    for (const date of calendarGridDates(this.displayedMonth, weekStart)) {
      this.createDay(grid, date, this.plugin.index.recordForDate(date));
    }
  }

  private createWeekList(parent: HTMLElement, weekStart: Weekday): void {
    const list = parent.createDiv("daymark-week-list");
    for (const date of calendarWeekDates(this.selectedDate, weekStart)) {
      this.createWeekRow(list, date, this.plugin.index.recordForDate(date));
    }
  }

  private createDay(parent: HTMLElement, date: PlainDate, record: DailyRecord | null): void {
    const isoDate = toIsoDate(date);
    const current = todayPlainDate();
    const outside = date.year !== this.displayedMonth.year || date.month !== this.displayedMonth.month;
    const selected = isoDate === toIsoDate(this.selectedDate);
    const today = isoDate === toIsoDate(current);
    const weekday = toDate(date).getUTCDay();
    const highlighted = this.plugin.settings.highlightedWeekdays.includes(weekday as Weekday);
    const cover = record && this.plugin.settings.showCoverPhotos ? this.firstCoverFile(record) : null;
    const classes = [
      "daymark-calendar-day",
      outside ? "is-outside-month" : "",
      selected ? "is-selected" : "",
      today ? "is-today" : "",
      weekday === 0 || weekday === 6 ? "is-weekend" : "",
      highlighted ? "is-highlighted" : "",
      record ? "has-note" : "",
      cover ? "has-cover" : ""
    ].filter(Boolean).join(" ");
    const button = parent.createEl("button", { cls: classes });
    button.setAttr("role", "gridcell");
    button.setAttr("aria-selected", String(selected));
    const label = button.createEl("span", {
      cls: "daymark-visually-hidden",
      text: this.dayLabel(date, record)
    });
    label.id = `${this.accessibleId}-${isoDate}`;
    button.setAttr("aria-labelledby", label.id);
    if (today) button.setAttr("aria-current", "date");
    if (cover) {
      const image = button.createEl("img", { cls: "daymark-calendar-day-cover" });
      image.setAttr("alt", "");
      image.setAttr("loading", "lazy");
      image.src = this.app.vault.getResourcePath(cover);
    }
    button.createEl("span", { cls: "daymark-calendar-day-number", text: String(date.day) });
    button.addEventListener("click", () => {
      this.selectedDate = date;
      if (outside) this.displayedMonth = firstOfMonth(date);
      this.saveViewState();
      this.render();
      void this.plugin.openOrCreateDailyNote(date);
    });
  }

  private createWeekRow(parent: HTMLElement, date: PlainDate, record: DailyRecord | null): void {
    const isoDate = toIsoDate(date);
    const weekday = toDate(date).getUTCDay() as Weekday;
    const selected = isoDate === toIsoDate(this.selectedDate);
    const today = isoDate === toIsoDate(todayPlainDate());
    const highlighted = this.plugin.settings.highlightedWeekdays.includes(weekday);
    const cover = record && this.plugin.settings.showCoverPhotos ? this.firstCoverFile(record) : null;
    const classes = [
      "daymark-week-row",
      selected ? "is-selected" : "",
      today ? "is-today" : "",
      highlighted ? "is-highlighted" : "",
      record ? "has-note" : "",
      cover ? "has-cover" : ""
    ].filter(Boolean).join(" ");
    const row = parent.createEl("button", { cls: classes });
    const label = row.createEl("span", {
      cls: "daymark-visually-hidden",
      text: this.dayLabel(date, record)
    });
    label.id = `${this.accessibleId}-week-${isoDate}`;
    row.setAttr("aria-labelledby", label.id);
    row.setAttr("aria-pressed", String(selected));
    if (today) row.setAttr("aria-current", "date");

    const tile = row.createSpan("daymark-week-date-tile");
    if (cover) {
      const image = tile.createEl("img", { cls: "daymark-week-date-cover" });
      image.setAttr("alt", "");
      image.setAttr("loading", "lazy");
      image.src = this.app.vault.getResourcePath(cover);
    }
    tile.createEl("span", { cls: "daymark-week-date-number", text: String(date.day) });

    const details = row.createSpan("daymark-week-details");
    const weekdayLabel = details.createEl("span", { cls: "daymark-week-weekday" });
    weekdayLabel.createEl("span", {
      cls: "daymark-week-weekday-long",
      text: new Intl.DateTimeFormat(this.plugin.locale, { weekday: "long", timeZone: "UTC" }).format(toDate(date))
    });
    weekdayLabel.createEl("span", {
      cls: "daymark-week-weekday-short",
      text: new Intl.DateTimeFormat(this.plugin.locale, { weekday: "short", timeZone: "UTC" }).format(toDate(date))
    });
    const metrics = details.createEl("span", {
      cls: `daymark-week-metrics${record ? "" : " is-empty"}`
    });
    if (record) {
      metrics.createEl("span", {
        text: `${this.formatNumber(record.words)} ${record.words === 1 ? "word" : "words"}`
      });
      if (record.totalCheckboxes > 0) {
        metrics.createEl("span", {
          text: `${this.formatNumber(record.completedCheckboxes)}/${this.formatNumber(record.totalCheckboxes)} checked`
        });
      }
    } else {
      metrics.setText("No note");
    }

    row.addEventListener("click", () => {
      this.selectedDate = date;
      this.displayedMonth = firstOfMonth(date);
      this.saveViewState();
      this.render();
      void this.plugin.openOrCreateDailyNote(date);
    });
  }

  private dayLabel(date: PlainDate, record: DailyRecord | null): string {
    const label = new Intl.DateTimeFormat(this.plugin.locale, {
      dateStyle: "full",
      timeZone: "UTC"
    }).format(toDate(date));
    if (!record) return `${label}. No daily note; select to confirm creation.`;
    const checkedItems = record.totalCheckboxes > 0
      ? ` ${record.completedCheckboxes} of ${record.totalCheckboxes} items checked.`
      : "";
    return `${label}. ${record.words} words.${checkedItems}`;
  }

  private firstCoverFile(record: DailyRecord): TFile | null {
    const note = this.app.vault.getAbstractFileByPath(record.path);
    if (!(note instanceof TFile)) return null;
    const embeds = this.app.metadataCache.getFileCache(note)?.embeds ?? [];
    for (const embed of embeds) {
      const file = this.app.metadataCache.getFirstLinkpathDest(embed.link, note.path);
      if (file && isSupportedCoverPath(file.path)) return file;
    }
    return null;
  }

  private createFooter(parent: HTMLElement, bounds: ReturnType<typeof getPeriodBounds>): void {
    if (!this.plugin.settings.showSelectedDayStats && !this.plugin.settings.tallyEnabled) return;

    const footer = parent.createDiv("daymark-calendar-footer");
    if (this.plugin.settings.showSelectedDayStats) {
      const stats = footer.createEl("span", { cls: "daymark-calendar-selected-stats" });
      const aggregate = this.plugin.index.aggregate(bounds);
      if (aggregate.noteCount === 0) {
        stats.setText("No daily notes");
      } else {
        const parts = [
          `${this.formatNumber(aggregate.noteCount)} ${aggregate.noteCount === 1 ? "note" : "notes"}`,
          `${this.formatNumber(aggregate.words)} ${aggregate.words === 1 ? "word" : "words"}`
        ];
        if (aggregate.totalCheckboxes > 0) {
          parts.push(`${this.formatNumber(aggregate.completedCheckboxes)}/${this.formatNumber(aggregate.totalCheckboxes)} checked`);
        }
        stats.setText(parts.join(" · "));
      }
    } else {
      footer.addClass("is-stats-hidden");
    }

    if (this.plugin.settings.tallyEnabled) {
      const tally = footer.createEl("button", { cls: "daymark-calendar-tally" });
      const icon = tally.createEl("span", { cls: "daymark-calendar-tally-icon" });
      setIcon(icon, "list-checks");
      tally.createEl("span", { cls: "daymark-calendar-tally-label", text: "Tally" });
      tally.addEventListener("click", () => {
        void this.plugin.openTallyView().then((view) => view?.showPeriod(this.mode, this.selectedDate));
      });
    } else {
      footer.addClass("is-tally-hidden");
    }
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat(this.plugin.locale, { maximumFractionDigits: 0 }).format(value);
  }

  private dateIsInDisplayedMonth(date: PlainDate): boolean {
    return date.year === this.displayedMonth.year && date.month === this.displayedMonth.month;
  }

  private syncToFile(file: TFile | null, shouldRender = true): void {
    if (!file) return;
    const date = this.plugin.index.dateForFile(file);
    if (!date) return;
    this.selectedDate = date;
    this.displayedMonth = firstOfMonth(date);
    this.saveViewState();
    if (shouldRender) this.render();
  }

  private saveViewState(): void {
    void this.app.workspace.requestSaveLayout();
  }

}
