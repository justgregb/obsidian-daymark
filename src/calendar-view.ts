import { ItemView, Platform, setIcon, TFile, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import {
  calendarGridDates,
  calendarWeekDates,
  calendarWeekdays,
  calendarYearActivityDates,
  yearWritingIntensity
} from "./calendar-grid";
import { installRovingNavigation } from "./calendar-keyboard";
import { formatCalendarFooterSummary } from "./calendar-summary";
import {
  isYearMonthNavigationKey,
  moveCalendarViewport,
  moveYearViewport,
  selectCalendarDate,
  type CalendarViewportState,
  yearMonthNavigationIndex
} from "./calendar-state";
import { isSupportedCoverPath } from "./cover";
import {
  getPeriodBounds,
  formatPeriodTitle,
  parseIsoDate,
  todayPlainDate,
  toDate,
  toIsoDate
} from "./date";
import { InlineTally } from "./inline-tally";
import { dateTimeFormatter, numberFormatter } from "./intl-cache";
import type DaymarkPlugin from "./main";
import type { DailyRecord, PeriodAggregate, PeriodMode, PlainDate, Weekday } from "./types";

export const DAYMARK_CALENDAR_VIEW_TYPE = "daymark-calendar-view";
let calendarViewSequence = 0;

interface CalendarViewState {
  mode?: unknown;
  month?: unknown;
  week?: unknown;
  selectedDate?: unknown;
  tallyExpanded?: unknown;
}

type CalendarViewMode = PeriodMode;

function firstOfMonth(date: PlainDate): PlainDate {
  return { year: date.year, month: date.month, day: 1 };
}

function nextCalendarViewMode(mode: CalendarViewMode): CalendarViewMode {
  if (mode === "week") return "month";
  if (mode === "month") return "year";
  return "week";
}

export class DaymarkCalendarView extends ItemView {
  private readonly accessibleId = `daymark-calendar-${++calendarViewSequence}`;
  private mode: CalendarViewMode = "month";
  private displayedMonth = firstOfMonth(todayPlainDate());
  private displayedWeek = todayPlainDate();
  private selectedDate = todayPlainDate();
  private tallyExpanded = !Platform.isMobile;
  private unsubscribe: (() => void) | null = null;
  private opened = false;
  private dayCellSequence = 0;
  private formatterLocale: string | null = null;
  private fullDateFormatter!: Intl.DateTimeFormat;
  private longWeekdayNames: string[] = [];
  private monthFormatter!: Intl.DateTimeFormat;
  private numberFormatter!: Intl.NumberFormat;
  private shortWeekdayNames: string[] = [];
  private renderSelectedIso = "";
  private renderTodayIso = "";
  private renderVersion = 0;
  private readonly inlineTally: InlineTally;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: DaymarkPlugin) {
    super(leaf);
    this.inlineTally = new InlineTally(plugin, () => this.render());
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
      week: toIsoDate(this.displayedWeek),
      selectedDate: toIsoDate(this.selectedDate),
      tallyExpanded: this.tallyExpanded
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
    if (typeof state.week === "string") {
      const week = parseIsoDate(state.week);
      if (week) this.displayedWeek = week;
    } else {
      this.displayedWeek = this.selectedDate;
    }
    if (typeof state.tallyExpanded === "boolean") this.tallyExpanded = state.tallyExpanded;
    await super.setState(state, result);
    if (this.opened) this.render();
  }

  override async onOpen(): Promise<void> {
    this.containerEl.addClass("daymark-calendar-container");
    this.opened = true;
    this.unsubscribe = this.plugin.subscribe(() => this.render());
    this.registerEvent(this.app.workspace.on("file-open", (file) => this.syncToFile(file)));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      const record = this.plugin.index.recordForDate(this.selectedDate);
      if (record?.path === file.path) this.render();
    }));
    this.renderLoading();
    try {
      await this.plugin.ensureTallyReady();
      this.syncToFile(this.app.workspace.getActiveFile(), false);
      this.render();
    } catch (error) {
      this.renderError(error);
    }
  }

  override async onClose(): Promise<void> {
    this.opened = false;
    this.containerEl.removeClass("daymark-calendar-container");
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
    const renderVersion = ++this.renderVersion;
    this.prepareRenderContext();
    const weekStart = this.plugin.resolveWeekStart();
    const anchor = this.mode === "week" ? this.displayedWeek : this.displayedMonth;
    const bounds = getPeriodBounds(anchor, this.mode, weekStart);
    const aggregate = this.plugin.index.aggregate(bounds);
    const root = this.contentEl;
    this.dayCellSequence = 0;
    root.empty();
    root.addClass("daymark-calendar-view");
    root.toggleClass("is-week-view", this.mode === "week");
    root.toggleClass("is-month-view", this.mode === "month");
    root.toggleClass("is-year-view", this.mode === "year");
    root.toggleClass("is-tally-expanded", this.plugin.settings.tallyEnabled && this.tallyExpanded);
    root.toggleClass("has-footer", this.plugin.settings.showCalendarTotals || this.plugin.settings.tallyEnabled);

    this.createHeader(root, bounds);
    const body = root.createDiv("daymark-calendar-body");
    if (this.mode === "year") this.createYearView(body, weekStart);
    else if (this.mode === "month") this.createMonthView(body, weekStart);
    else this.createWeekView(body, weekStart);
    this.createFooter(root, aggregate, renderVersion);
  }

  private createHeader(parent: HTMLElement, bounds: ReturnType<typeof getPeriodBounds>): void {
    const header = parent.createDiv("daymark-calendar-header");
    const title = header.createDiv("daymark-calendar-title");
    title.setText(formatPeriodTitle(bounds, this.mode, this.plugin.locale));
    const controls = header.createDiv("daymark-calendar-header-controls");
    const targetMode = nextCalendarViewMode(this.mode);
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
      this.displayedWeek = current;
      this.selectedDate = current;
      this.saveViewState();
      this.render();
    });
    this.createNavigationButton(controls, "chevron-right", `Next ${this.mode}`, 1);
  }

  private setMode(mode: CalendarViewMode): void {
    if (this.mode === mode) return;
    const previousMode = this.mode;
    if (mode === "week") {
      this.displayedWeek = this.dateIsInDisplayedMonth(this.selectedDate)
        ? this.selectedDate
        : this.displayedMonth;
    }
    if (mode === "month" && previousMode === "week") {
      this.displayedMonth = firstOfMonth(this.displayedWeek);
    }
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
        this.applyViewportState(moveCalendarViewport(this.viewportState(), "week", amount));
      } else if (this.mode === "month") {
        this.applyViewportState(moveCalendarViewport(this.viewportState(), "month", amount));
      } else {
        const state = moveYearViewport(
          this.displayedMonth,
          this.selectedDate,
          this.displayedMonth.year + amount
        );
        this.displayedMonth = state.displayedMonth;
      }
      this.saveViewState();
      this.render();
    });
  }

  private createWeekdays(parent: HTMLElement, weekStart: Weekday): void {
    const weekdays = parent.createDiv("daymark-calendar-weekdays");
    for (const weekday of calendarWeekdays(weekStart)) {
      weekdays.createEl("span", {
        text: this.shortWeekdayNames[weekday]?.toLocaleUpperCase(this.plugin.locale) ?? ""
      });
    }
  }

  private createMonthView(parent: HTMLElement, weekStart: Weekday): void {
    const section = parent.createDiv("daymark-month-section");
    this.createWeekdays(section, weekStart);
    const grid = section.createDiv("daymark-calendar-grid");
    grid.setAttr("role", "grid");
    for (const date of calendarGridDates(this.displayedMonth, weekStart)) {
      this.createDay(grid, date, this.plugin.index.recordForDate(date), this.displayedMonth);
    }
    installRovingNavigation(
      grid,
      ".daymark-calendar-day",
      7,
      this.dateIsInDisplayedMonth(this.selectedDate) ? this.renderSelectedIso : undefined
    );
  }

  private createYearView(parent: HTMLElement, weekStart: Weekday): void {
    this.createYearSection(parent, this.displayedMonth.year, weekStart);
  }

  private createYearSection(
    parent: HTMLElement,
    year: number,
    weekStart: Weekday
  ): void {
    const section = parent.createDiv("daymark-year-section");
    const months = section.createDiv("daymark-year-months");
    const aggregate = this.plugin.index.aggregate(getPeriodBounds({ year, month: 1, day: 1 }, "year", weekStart));
    const wordsByDate = new Map<string, number>();
    let busiestDayWords = 0;
    for (const source of aggregate.wordSources) {
      wordsByDate.set(source.isoDate, source.value);
      busiestDayWords = Math.max(busiestDayWords, source.value);
    }
    for (let month = 1; month <= 12; month += 1) {
      const first = { year, month, day: 1 };
      const dates = calendarYearActivityDates(first, weekStart);
      let noteCount = 0;
      let wordCount = 0;
      const activityDates = dates.map((date) => {
        const isoDate = date ? toIsoDate(date) : null;
        const hasNote = date ? this.plugin.index.recordForDate(date) !== null : false;
        const words = isoDate ? wordsByDate.get(isoDate) ?? 0 : 0;
        if (hasNote) noteCount += 1;
        wordCount += words;
        return {
          date,
          hasNote,
          words
        };
      });
      const monthLabel = this.monthFormatter.format(toDate(first));
      const selectedMonth = this.selectedDate.year === year && this.selectedDate.month === month;
      const button = months.createEl("button", {
        cls: `daymark-year-month${selectedMonth ? " is-selected-month" : ""}`
      });
      button.dataset.month = toIsoDate(first);
      button.setAttr(
        "aria-label",
        `${monthLabel} ${year}, ${noteCount} ${noteCount === 1 ? "daily note" : "daily notes"}, ${wordCount} ${wordCount === 1 ? "word" : "words"}. Show month view.`
      );
      button.setAttr("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown Home End");
      button.createSpan({ cls: "daymark-year-month-title", text: monthLabel });
      const activity = button.createSpan("daymark-year-activity");
      activity.setAttr("aria-hidden", "true");

      for (const { date, hasNote, words } of activityDates) {
        if (!date) {
          activity.createSpan("daymark-year-mark is-empty");
          continue;
        }
        const isoDate = toIsoDate(date);
        const weekday = toDate(date).getUTCDay() as Weekday;
        const intensity = yearWritingIntensity(words, busiestDayWords);
        const classes = [
          "daymark-year-mark",
          this.plugin.settings.highlightedWeekdays.includes(weekday) ? "is-highlighted" : "",
          hasNote ? "has-note" : "",
          intensity ? `has-writing-${intensity}` : "",
          isoDate === this.renderTodayIso ? "is-today" : "",
          isoDate === this.renderSelectedIso ? "is-selected" : ""
        ].filter(Boolean).join(" ");
        const mark = activity.createSpan(classes);
        mark.dataset.date = isoDate;
      }

      button.addEventListener("click", () => {
        this.displayedMonth = first;
        this.setMode("month");
      });
      button.addEventListener("keydown", (event) => this.handleYearMonthKeydown(event, button, months));
    }
  }

  private handleYearMonthKeydown(
    event: KeyboardEvent,
    current: HTMLButtonElement,
    months: HTMLElement
  ): void {
    if (!isYearMonthNavigationKey(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(months.querySelectorAll<HTMLButtonElement>(".daymark-year-month"));
    const currentIndex = buttons.indexOf(current);
    const firstTop = buttons[0]?.offsetTop;
    const firstNextRow = firstTop === undefined
      ? -1
      : buttons.findIndex((button) => button.offsetTop > firstTop + 1);
    const gridTemplate = window.getComputedStyle(months).gridTemplateColumns.trim();
    const computedTracks = gridTemplate.length > 0 && gridTemplate !== "none"
      ? gridTemplate.split(/\s+/u).filter(Boolean).length
      : 0;
    const columnCount = firstNextRow > 0 ? firstNextRow : computedTracks > 0 ? computedTracks : 3;
    const targetIndex = yearMonthNavigationIndex(currentIndex, event.key, columnCount, buttons.length);
    if (targetIndex !== null) buttons[targetIndex]?.focus();
  }

  private createWeekView(parent: HTMLElement, weekStart: Weekday): void {
    const currentWeek = getPeriodBounds(this.displayedWeek, "week", weekStart).start;
    const section = parent.createDiv("daymark-week-section");
    const list = section.createDiv("daymark-week-list");
    for (const date of calendarWeekDates(currentWeek, weekStart)) {
      this.createWeekRow(list, date, this.plugin.index.recordForDate(date));
    }
    installRovingNavigation(list, ".daymark-week-row", 1, this.renderSelectedIso);
  }

  private createDay(
    parent: HTMLElement,
    date: PlainDate,
    record: DailyRecord | null,
    displayedMonth = this.displayedMonth
  ): void {
    const isoDate = toIsoDate(date);
    const outside = date.year !== displayedMonth.year || date.month !== displayedMonth.month;
    const selected = isoDate === this.renderSelectedIso && !outside;
    const today = isoDate === this.renderTodayIso && !outside;
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
      image.setAttr("decoding", "async");
      image.setAttr("loading", "lazy");
      image.src = this.app.vault.getResourcePath(cover);
    }
    button.createEl("span", { cls: "daymark-calendar-day-number", text: String(date.day) });
    button.addEventListener("click", () => {
      const state = selectCalendarDate(date);
      this.selectedDate = state.selectedDate;
      this.displayedMonth = state.displayedMonth;
      this.displayedWeek = state.displayedWeek;
      this.saveViewState();
      this.render();
      void this.plugin.openOrCreateDailyNote(date);
    });
  }

  private createWeekRow(parent: HTMLElement, date: PlainDate, record: DailyRecord | null): void {
    const isoDate = toIsoDate(date);
    const weekday = toDate(date).getUTCDay() as Weekday;
    const selected = isoDate === this.renderSelectedIso;
    const today = isoDate === this.renderTodayIso;
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
      image.setAttr("decoding", "async");
      image.setAttr("loading", "lazy");
      image.src = this.app.vault.getResourcePath(cover);
    }
    tile.createEl("span", { cls: "daymark-week-date-number", text: String(date.day) });

    const details = row.createSpan("daymark-week-details");
    const weekdayLabel = details.createEl("span", { cls: "daymark-week-weekday" });
    weekdayLabel.createEl("span", {
      cls: "daymark-week-weekday-long",
      text: this.longWeekdayNames[weekday] ?? ""
    });
    weekdayLabel.createEl("span", {
      cls: "daymark-week-weekday-short",
      text: this.shortWeekdayNames[weekday] ?? ""
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
      const state = selectCalendarDate(date);
      this.selectedDate = state.selectedDate;
      this.displayedMonth = state.displayedMonth;
      this.displayedWeek = state.displayedWeek;
      this.saveViewState();
      this.render();
      void this.plugin.openOrCreateDailyNote(date);
    });
  }

  private dayLabel(date: PlainDate, record: DailyRecord | null): string {
    const label = this.fullDateFormatter.format(toDate(date));
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

  private createFooter(parent: HTMLElement, aggregate: PeriodAggregate, renderVersion: number): void {
    if (!this.plugin.settings.showCalendarTotals && !this.plugin.settings.tallyEnabled) return;

    const footer = parent.createDiv("daymark-calendar-footer");
    const expanded = this.plugin.settings.tallyEnabled && this.tallyExpanded;
    footer.toggleClass("is-expanded", expanded);

    if (!expanded) {
      if (this.plugin.settings.tallyEnabled) this.createTallyToggle(footer, false);
      else footer.addClass("is-tally-hidden");
      if (this.plugin.settings.showCalendarTotals) {
        const summary = formatCalendarFooterSummary(aggregate, this.plugin.locale);
        const stats = footer.createEl("span", { cls: "daymark-calendar-selected-stats" });
        stats.setAttr("aria-label", summary.full);
        const full = stats.createSpan({ cls: "daymark-calendar-selected-stats-text is-full", text: summary.full });
        full.setAttr("aria-hidden", "true");
        const compact = stats.createSpan({
          cls: "daymark-calendar-selected-stats-text is-compact",
          text: summary.compact
        });
        compact.setAttr("aria-hidden", "true");
      } else {
        footer.addClass("is-stats-hidden");
      }
      return;
    }

    const heading = footer.createDiv("daymark-tally-heading");
    this.createTallyToggle(heading, true);
    this.inlineTally.createReportAction(
      heading,
      this.mode,
      aggregate,
      renderVersion,
      (version) => this.opened && version === this.renderVersion
    );
    const panel = footer.createDiv("daymark-tally-panel");
    panel.id = `${this.accessibleId}-tally-panel`;
    this.inlineTally.createMetrics(panel, aggregate);
  }

  private createTallyToggle(parent: HTMLElement, expanded: boolean): void {
    const tally = parent.createEl("button", { cls: "daymark-calendar-tally" });
    tally.setAttr("type", "button");
    tally.setAttr("aria-expanded", String(expanded));
    if (expanded) tally.setAttr("aria-controls", `${this.accessibleId}-tally-panel`);
    tally.setAttr("aria-label", expanded ? "Collapse Tally" : "Expand Tally");
    tally.createEl("span", { cls: "daymark-calendar-tally-label", text: "Tally" });
    const chevron = tally.createEl("span", { cls: "daymark-calendar-tally-chevron" });
    setIcon(chevron, expanded ? "chevron-up" : "chevron-down");
    tally.addEventListener("click", () => {
      this.tallyExpanded = !expanded;
      this.saveViewState();
      this.render();
      if (expanded) this.contentEl.scrollTop = 0;
    });
  }

  private formatNumber(value: number): string {
    return this.numberFormatter.format(value);
  }

  private prepareRenderContext(): void {
    const locale = this.plugin.locale;
    if (this.formatterLocale !== locale) {
      this.formatterLocale = locale;
      this.fullDateFormatter = dateTimeFormatter(locale, { dateStyle: "full", timeZone: "UTC" });
      this.monthFormatter = dateTimeFormatter(locale, { month: "short", timeZone: "UTC" });
      this.numberFormatter = numberFormatter(locale, { maximumFractionDigits: 0 });
      const longWeekday = dateTimeFormatter(locale, { weekday: "long", timeZone: "UTC" });
      const shortWeekday = dateTimeFormatter(locale, { weekday: "short", timeZone: "UTC" });
      this.longWeekdayNames = [];
      this.shortWeekdayNames = [];
      for (let weekday = 0; weekday < 7; weekday += 1) {
        const sample = new Date(Date.UTC(2026, 0, 4 + weekday));
        this.longWeekdayNames.push(longWeekday.format(sample));
        this.shortWeekdayNames.push(shortWeekday.format(sample));
      }
    }
    this.renderSelectedIso = toIsoDate(this.selectedDate);
    this.renderTodayIso = toIsoDate(todayPlainDate());
  }

  private dateIsInDisplayedMonth(date: PlainDate): boolean {
    return date.year === this.displayedMonth.year && date.month === this.displayedMonth.month;
  }

  private viewportState(): CalendarViewportState {
    return {
      displayedMonth: this.displayedMonth,
      displayedWeek: this.displayedWeek,
      selectedDate: this.selectedDate
    };
  }

  private applyViewportState(state: CalendarViewportState): void {
    this.displayedMonth = state.displayedMonth;
    this.displayedWeek = state.displayedWeek;
    this.selectedDate = state.selectedDate;
  }

  showDate(date: PlainDate): void {
    const state = selectCalendarDate(date);
    this.applyViewportState(state);
    this.saveViewState();
    this.render();
  }

  showPeriod(mode: PeriodMode, anchor: PlainDate): void {
    this.mode = mode;
    this.displayedMonth = firstOfMonth(anchor);
    this.displayedWeek = anchor;
    this.tallyExpanded = true;
    this.saveViewState();
    this.render();
  }

  expandTally(): void {
    if (this.tallyExpanded) return;
    this.tallyExpanded = true;
    this.saveViewState();
    this.render();
  }

  async saveCurrentTallyPeriod(): Promise<void> {
    const today = todayPlainDate();
    this.displayedMonth = firstOfMonth(today);
    this.displayedWeek = today;
    this.tallyExpanded = true;
    this.saveViewState();
    await this.plugin.ensureTallyReady();
    const anchor = this.mode === "week" ? this.displayedWeek : this.displayedMonth;
    const bounds = getPeriodBounds(anchor, this.mode, this.plugin.resolveWeekStart());
    const aggregate = this.plugin.index.aggregate(bounds);
    this.render();
    await this.inlineTally.savePeriod(this.mode, aggregate);
  }

  private syncToFile(file: TFile | null, shouldRender = true): void {
    if (!file) return;
    const date = this.plugin.index.dateForFile(file);
    if (!date) return;
    const displayedMonth = firstOfMonth(date);
    if (toIsoDate(this.selectedDate) === toIsoDate(date)
      && toIsoDate(this.displayedMonth) === toIsoDate(displayedMonth)
      && toIsoDate(this.displayedWeek) === toIsoDate(date)) return;
    this.selectedDate = date;
    this.displayedMonth = displayedMonth;
    this.displayedWeek = date;
    this.saveViewState();
    if (shouldRender) this.render();
  }

  private saveViewState(): void {
    void this.app.workspace.requestSaveLayout();
  }

}
