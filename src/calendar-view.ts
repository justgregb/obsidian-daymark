import { ItemView, setIcon, TFile, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import {
  calendarGridDates,
  calendarMonthCells,
  calendarMonthDistance,
  calendarMonthSequence,
  calendarWeekDates,
  calendarWeekDistance,
  calendarWeekSequence,
  calendarWeekdays,
  calendarYearDistance,
  calendarYearSequence
} from "./calendar-grid";
import { nextCalendarMode } from "./calendar-mode";
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
import type { DailyRecord, PeriodMode, PlainDate, Weekday } from "./types";

export const DAYMARK_CALENDAR_VIEW_TYPE = "daymark-calendar-view";
let calendarViewSequence = 0;

interface CalendarViewState {
  mode?: unknown;
  month?: unknown;
  selectedDate?: unknown;
}

type CalendarViewMode = PeriodMode;

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
  private periodScrollTimer: number | null = null;
  private dayCellSequence = 0;

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
    if (state.mode === "month" || state.mode === "week" || state.mode === "year") this.mode = state.mode;
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
    this.clearPeriodScrollTimer();
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
    this.clearPeriodScrollTimer();
    this.dayCellSequence = 0;
    root.empty();
    root.addClass("daymark-calendar-view");
    root.toggleClass("is-week-view", this.mode === "week");
    root.toggleClass("is-month-view", this.mode === "month");
    root.toggleClass("is-year-view", this.mode === "year");
    root.toggleClass("has-footer", this.plugin.settings.showSelectedDayStats || this.plugin.settings.tallyEnabled);

    this.createHeader(root, bounds);
    const body = root.createDiv("daymark-calendar-body");
    if (this.mode === "year") {
      this.createYearScroller(body, weekStart);
    } else if (this.mode === "month") {
      this.createMonthScroller(body, weekStart);
    } else {
      this.createWeekScroller(body, weekStart);
    }
    this.createFooter(root, bounds);
  }

  private createHeader(parent: HTMLElement, bounds: ReturnType<typeof getPeriodBounds>): void {
    const header = parent.createDiv("daymark-calendar-header");
    const title = header.createDiv("daymark-calendar-title");
    title.setText(formatPeriodTitle(bounds, this.mode, this.plugin.locale));
    const controls = header.createDiv("daymark-calendar-header-controls");
    const targetMode = nextCalendarMode(this.mode);
    const modeIcons: Record<CalendarViewMode, string> = {
      week: "calendar-range",
      month: "calendar-days",
      year: "calendar"
    };
    const modeToggle = controls.createEl("button", {
      cls: "clickable-icon daymark-calendar-mode-toggle"
    });
    modeToggle.setAttr("aria-label", `Show ${targetMode} view`);
    setIcon(modeToggle, modeIcons[targetMode]);
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
      } else if (this.mode === "month") {
        const selectionAnchor = this.dateIsInDisplayedMonth(this.selectedDate)
          ? this.selectedDate
          : this.displayedMonth;
        this.selectedDate = shiftAnchor(selectionAnchor, "month", amount);
        this.displayedMonth = firstOfMonth(this.selectedDate);
      } else {
        this.selectedDate = shiftAnchor(this.selectedDate, "year", amount);
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

  private createMonthScroller(parent: HTMLElement, weekStart: Weekday): void {
    parent.addClass("daymark-period-scroller");
    parent.addClass("daymark-month-scroller");
    const months = calendarMonthSequence(this.displayedMonth, 3);
    for (const month of months) this.createMonthSection(parent, month, weekStart);

    const currentMonth = parent.querySelector<HTMLElement>(`[data-month="${toIsoDate(this.displayedMonth)}"]`);
    if (currentMonth) parent.scrollTop = currentMonth.offsetTop - parent.offsetTop;

    const settle = (): void => {
      this.clearPeriodScrollTimer();
      this.periodScrollTimer = window.setTimeout(() => this.settleMonthScroll(parent), 240);
    };
    parent.addEventListener("scroll", settle, { passive: true });
  }

  private createMonthSection(
    parent: HTMLElement,
    month: PlainDate,
    weekStart: Weekday
  ): void {
    const section = parent.createDiv("daymark-month-section");
    section.dataset.month = toIsoDate(month);
    this.createWeekdays(section, weekStart);
    const grid = section.createDiv("daymark-calendar-grid");
    grid.setAttr("role", "grid");
    for (const date of calendarGridDates(month, weekStart)) {
      this.createDay(grid, date, this.plugin.index.recordForDate(date), month);
    }
  }

  private settleMonthScroll(body: HTMLElement): void {
    this.clearPeriodScrollTimer();
    if (!body.isConnected || this.mode !== "month") return;
    const closest = this.closestPeriodSection(body, ".daymark-month-section");
    const month = closest?.dataset.month ? parseIsoDate(closest.dataset.month) : null;
    if (!month || calendarMonthDistance(this.displayedMonth, month) === 0) return;
    const distance = calendarMonthDistance(this.displayedMonth, month);
    this.displayedMonth = firstOfMonth(month);
    this.selectedDate = shiftAnchor(this.selectedDate, "month", distance);
    this.updateMonthChrome(body);
    this.saveViewState();
  }

  private updateMonthChrome(body: HTMLElement): void {
    const selectedDate = toIsoDate(this.selectedDate);
    for (const day of Array.from(body.querySelectorAll<HTMLElement>(".daymark-calendar-day"))) {
      const selected = day.dataset.date === selectedDate && !day.classList.contains("is-outside-month");
      day.classList.toggle("is-selected", selected);
      day.setAttr("aria-selected", String(selected));
    }

    this.updatePeriodHeaderAndFooter("month", this.displayedMonth);
  }

  private closestPeriodSection(body: HTMLElement, selector: string): HTMLElement | null {
    const sections = Array.from(body.querySelectorAll<HTMLElement>(selector));
    const bodyCenter = body.offsetTop + body.scrollTop + body.clientHeight / 2;
    return sections.reduce<HTMLElement | null>((best, section) => {
      if (!best) return section;
      const sectionCenter = section.offsetTop + section.offsetHeight / 2;
      const bestCenter = best.offsetTop + best.offsetHeight / 2;
      return Math.abs(sectionCenter - bodyCenter) < Math.abs(bestCenter - bodyCenter) ? section : best;
    }, null);
  }

  private updatePeriodHeaderAndFooter(mode: PeriodMode, anchor: PlainDate): void {
    const bounds = getPeriodBounds(anchor, mode, this.plugin.resolveWeekStart());
    this.contentEl.querySelector<HTMLElement>(".daymark-calendar-title")
      ?.setText(formatPeriodTitle(bounds, mode, this.plugin.locale));
    this.contentEl.querySelector<HTMLElement>(".daymark-calendar-footer")?.remove();
    this.createFooter(this.contentEl, bounds);
  }

  private clearPeriodScrollTimer(): void {
    if (this.periodScrollTimer === null) return;
    window.clearTimeout(this.periodScrollTimer);
    this.periodScrollTimer = null;
  }

  private createYearScroller(parent: HTMLElement, weekStart: Weekday): void {
    parent.addClass("daymark-period-scroller");
    parent.addClass("daymark-year-scroller");
    for (const year of calendarYearSequence(this.selectedDate)) {
      this.createYearSection(parent, year.year, weekStart);
    }

    const current = parent.querySelector<HTMLElement>(`[data-year="${this.selectedDate.year}"]`);
    if (current) parent.scrollTop = current.offsetTop - parent.offsetTop;

    const settle = (): void => {
      this.clearPeriodScrollTimer();
      this.periodScrollTimer = window.setTimeout(() => this.settleYearScroll(parent), 240);
    };
    parent.addEventListener("scroll", settle, { passive: true });
  }

  private createYearSection(parent: HTMLElement, year: number, weekStart: Weekday): void {
    const section = parent.createDiv("daymark-year-section");
    section.dataset.year = String(year);
    const months = section.createDiv("daymark-year-months");
    for (let month = 1; month <= 12; month += 1) {
      const monthDate = { year, month, day: 1 };
      const dates = calendarMonthCells(monthDate, weekStart);
      const noteCount = dates.reduce((count, date) => (
        count + (date && this.plugin.index.recordForDate(date) ? 1 : 0)
      ), 0);
      const monthName = new Intl.DateTimeFormat(this.plugin.locale, {
        month: "short",
        timeZone: "UTC"
      }).format(toDate(monthDate));
      const selectedMonth = this.selectedDate.year === year && this.selectedDate.month === month;
      const monthButton = months.createEl("button", {
        cls: `daymark-year-month${selectedMonth ? " is-selected-month" : ""}`
      });
      monthButton.dataset.month = toIsoDate(monthDate);
      monthButton.setAttr(
        "aria-label",
        `${monthName} ${monthDate.year}, ${noteCount} ${noteCount === 1 ? "daily note" : "daily notes"}. Show month view.`
      );
      monthButton.createSpan({ cls: "daymark-year-month-title", text: monthName });
      const activity = monthButton.createSpan("daymark-year-activity");
      activity.setAttr("aria-hidden", "true");
      for (const date of dates) {
        if (!date) {
          activity.createSpan("daymark-year-mark is-empty");
          continue;
        }
        const isoDate = toIsoDate(date);
        const weekday = toDate(date).getUTCDay() as Weekday;
        const classes = [
          "daymark-year-mark",
          this.plugin.settings.highlightedWeekdays.includes(weekday) ? "is-highlighted" : "",
          this.plugin.index.recordForDate(date) ? "has-note" : "",
          isoDate === toIsoDate(todayPlainDate()) ? "is-today" : "",
          isoDate === toIsoDate(this.selectedDate) ? "is-selected" : ""
        ].filter(Boolean).join(" ");
        const mark = activity.createSpan(classes);
        mark.dataset.date = isoDate;
      }
      monthButton.addEventListener("click", () => {
        this.selectedDate = this.selectedDate.year === year && this.selectedDate.month === month
          ? this.selectedDate
          : monthDate;
        this.displayedMonth = monthDate;
        this.setMode("month");
      });
    }
  }

  private settleYearScroll(body: HTMLElement): void {
    this.clearPeriodScrollTimer();
    if (!body.isConnected || this.mode !== "year") return;
    const closest = this.closestPeriodSection(body, ".daymark-year-section");
    const year = Number(closest?.dataset.year);
    if (!Number.isInteger(year)) return;
    const distance = calendarYearDistance(this.selectedDate, { year, month: 1, day: 1 });
    if (distance === 0) return;
    this.selectedDate = shiftAnchor(this.selectedDate, "year", distance);
    this.displayedMonth = firstOfMonth(this.selectedDate);
    this.updateYearChrome(body);
    this.saveViewState();
  }

  private updateYearChrome(body: HTMLElement): void {
    const selectedMonth = toIsoDate(firstOfMonth(this.selectedDate));
    for (const month of Array.from(body.querySelectorAll<HTMLElement>(".daymark-year-month"))) {
      month.classList.toggle("is-selected-month", month.dataset.month === selectedMonth);
    }

    const selectedDate = toIsoDate(this.selectedDate);
    for (const mark of Array.from(body.querySelectorAll<HTMLElement>(".daymark-year-mark"))) {
      mark.classList.toggle("is-selected", mark.dataset.date === selectedDate);
    }
    this.updatePeriodHeaderAndFooter("year", this.selectedDate);
  }

  private createWeekScroller(parent: HTMLElement, weekStart: Weekday): void {
    parent.addClass("daymark-period-scroller");
    parent.addClass("daymark-week-scroller");
    const currentWeek = getPeriodBounds(this.selectedDate, "week", weekStart).start;
    for (const week of calendarWeekSequence(this.selectedDate, weekStart, 3)) {
      this.createWeekSection(parent, week, weekStart);
    }

    const current = parent.querySelector<HTMLElement>(`[data-week="${toIsoDate(currentWeek)}"]`);
    if (current) parent.scrollTop = current.offsetTop - parent.offsetTop;

    const settle = (): void => {
      this.clearPeriodScrollTimer();
      this.periodScrollTimer = window.setTimeout(() => this.settleWeekScroll(parent, weekStart), 240);
    };
    parent.addEventListener("scroll", settle, { passive: true });
  }

  private createWeekSection(parent: HTMLElement, week: PlainDate, weekStart: Weekday): void {
    const section = parent.createDiv("daymark-week-section");
    section.dataset.week = toIsoDate(week);
    const list = section.createDiv("daymark-week-list");
    for (const date of calendarWeekDates(week, weekStart)) {
      this.createWeekRow(list, date, this.plugin.index.recordForDate(date));
    }
  }

  private settleWeekScroll(body: HTMLElement, weekStart: Weekday): void {
    this.clearPeriodScrollTimer();
    if (!body.isConnected || this.mode !== "week") return;
    const closest = this.closestPeriodSection(body, ".daymark-week-section");
    const week = closest?.dataset.week ? parseIsoDate(closest.dataset.week) : null;
    if (!week) return;
    const distance = calendarWeekDistance(this.selectedDate, week, weekStart);
    if (distance === 0) return;
    this.selectedDate = shiftAnchor(this.selectedDate, "week", distance);
    this.displayedMonth = firstOfMonth(this.selectedDate);
    this.updateWeekChrome(body);
    this.saveViewState();
  }

  private updateWeekChrome(body: HTMLElement): void {
    const selectedDate = toIsoDate(this.selectedDate);
    for (const row of Array.from(body.querySelectorAll<HTMLElement>(".daymark-week-row"))) {
      const selected = row.dataset.date === selectedDate;
      row.classList.toggle("is-selected", selected);
      row.setAttr("aria-pressed", String(selected));
    }
    this.updatePeriodHeaderAndFooter("week", this.selectedDate);
  }

  private createDay(
    parent: HTMLElement,
    date: PlainDate,
    record: DailyRecord | null,
    visibleMonth = this.displayedMonth
  ): void {
    const isoDate = toIsoDate(date);
    const current = todayPlainDate();
    const outside = date.year !== visibleMonth.year || date.month !== visibleMonth.month;
    const selected = isoDate === toIsoDate(this.selectedDate) && !outside;
    const today = isoDate === toIsoDate(current) && !outside;
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
    button.dataset.date = isoDate;
    button.setAttr("role", "gridcell");
    button.setAttr("aria-selected", String(selected));
    const label = button.createEl("span", {
      cls: "daymark-visually-hidden",
      text: this.dayLabel(date, record)
    });
    label.id = `${this.accessibleId}-${++this.dayCellSequence}-${isoDate}`;
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
    row.dataset.date = isoDate;
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
