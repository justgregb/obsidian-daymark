import { ItemView, Notice, Platform, setIcon, TFile, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import {
  calendarGridDates,
  calendarWeekDates,
  calendarWeekdays,
  calendarYearActivityIndex,
  calendarYearActivityDates,
  yearWritingIntensity
} from "./calendar-grid";
import { formatCalendarFooterSummary } from "./calendar-summary";
import {
  moveCalendarViewport,
  moveYearViewport,
  selectCalendarDate,
  type CalendarViewportState
} from "./calendar-state";
import {
  changeAffectsBounds,
  DaymarkChangeAccumulator,
  type DaymarkChangeSet
} from "./change-set";
import { isSupportedCoverPath } from "./cover";
import {
  applyCoverThumbnail,
  CoverThumbnailCache,
  coverThumbnailFingerprint,
  generateCoverThumbnailUrl,
  resolveCoverThumbnail,
  type CoverThumbnailSource
} from "./cover-thumbnail-cache";
import {
  dateIsWithin,
  datesEqual,
  getPeriodBounds,
  formatPeriodTitle,
  parseIsoDate,
  todayPlainDate,
  toDate,
  toIsoDate
} from "./date";
import { watchDayChange } from "./day-rollover";
import { InlineTally } from "./inline-tally";
import { dateTimeFormatter, numberFormatter } from "./intl-cache";
import { calendarPeriodMode } from "./margin-calendar";
import { marginTallyLenses, normalizeMarginLens, resolveMarginLens, type MarginTallyLens } from "./margin-tally";
import { createMarginTally, type MarginTallyControls } from "./margin-tally-view";
import {
  captureMarginFocus,
  createMarginHeader,
  updateMarginHeader,
  type MarginCalendarContext,
  type MarginNameEditor
} from "./margin-calendar-view";
import { MarginTimeline, normalizeMarginScroll, type MarginScrollAnchor } from "./margin-timeline";
import { syncDatePriority } from "./sync-scheduler";
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
  marginTallyExpanded?: unknown;
  marginLens?: unknown;
  marginScroll?: unknown;
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
  private standardMode: CalendarViewMode = "month";
  private displayedMonth = firstOfMonth(todayPlainDate());
  private displayedWeek = todayPlainDate();
  private selectedDate = todayPlainDate();
  private standardTallyExpanded = !Platform.isMobile;
  private marginTallyExpanded = false;
  private marginLensId: string | null = null;
  private marginTimeline: MarginTimeline | null = null;
  private readonly marginWireSeed = Math.floor(Math.random() * 0x100000000);
  private readonly marginExpandedLinks = new Set<string>();
  private readonly marginExpandedFolds = new Set<string>();
  private readonly marginLenses = new Map<string, MarginTallyLens | null>();
  private marginScroll: MarginScrollAnchor | null = null;
  private marginTallySlot: HTMLElement | null = null;
  private disposeMarginTally: ReturnType<typeof createMarginTally> | null = null;
  private disposeDayWatch: (() => void) | null = null;
  private readonly marginNameEditor: MarginNameEditor = { draft: null };
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
  private highlightedWeekdayMask = 0;
  private renderFrame: number | null = null;
  private layoutSaveTimer: number | null = null;
  private renderVersion = 0;
  private bodyEl: HTMLElement | null = null;
  private footerEl: HTMLElement | null = null;
  private readonly pendingChanges = new DaymarkChangeAccumulator();
  private readonly coverCache = new Map<string, { metadata: unknown; cover: TFile | null }>();
  private readonly coverThumbnails: CoverThumbnailCache;
  private readonly inlineTally: InlineTally;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: DaymarkPlugin) {
    super(leaf);
    this.coverThumbnails = new CoverThumbnailCache({
      generate: (source, dimension) => this.generateCoverThumbnail(source, dimension)
    });
    this.inlineTally = new InlineTally(plugin, () => this.renderFooterOnly());
  }

  private get isMargin(): boolean {
    return this.plugin.settings.calendarLayout === "margin";
  }

  private get mode(): CalendarViewMode {
    return calendarPeriodMode(this.standardMode, this.plugin.settings.calendarLayout);
  }

  private set mode(value: CalendarViewMode) {
    this.standardMode = value;
  }

  private get tallyExpanded(): boolean {
    return this.isMargin ? this.marginTallyExpanded : this.standardTallyExpanded;
  }

  private set tallyExpanded(value: boolean) {
    if (this.isMargin) this.marginTallyExpanded = value;
    else this.standardTallyExpanded = value;
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
      mode: this.standardMode,
      month: toIsoDate(this.displayedMonth),
      week: toIsoDate(this.displayedWeek),
      selectedDate: toIsoDate(this.selectedDate),
      tallyExpanded: this.standardTallyExpanded,
      marginTallyExpanded: this.marginTallyExpanded,
      marginLens: this.marginLensId,
      marginScroll: this.marginTimeline?.snapshot() ?? this.marginScroll
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
    if (typeof state.tallyExpanded === "boolean") this.standardTallyExpanded = state.tallyExpanded;
    if (typeof state.marginTallyExpanded === "boolean") this.marginTallyExpanded = state.marginTallyExpanded;
    if (state.marginLens !== undefined) this.marginLensId = normalizeMarginLens(state.marginLens);
    if (state.marginScroll !== undefined) {
      this.marginTimeline?.dispose();
      this.marginTimeline = null;
      this.marginScroll = normalizeMarginScroll(state.marginScroll);
    }
    await super.setState(state, result);
    if (this.opened) this.render();
  }

  override async onOpen(): Promise<void> {
    this.containerEl.addClass("daymark-calendar-container");
    this.opened = true;
    this.unsubscribe = this.plugin.subscribe((change) => this.schedulePluginChange(change));
    this.registerEvent(this.app.workspace.on("file-open", (file) => this.syncToFile(file)));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && isSupportedCoverPath(file.path)) {
        this.refreshChangedCoverAssets([file.path]);
      }
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (file instanceof TFile && isSupportedCoverPath(file.path)) {
        this.refreshChangedCoverAssets([file.path]);
      }
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      const paths = [oldPath];
      if (file instanceof TFile) paths.push(file.path);
      if (paths.some((path) => isSupportedCoverPath(path))) this.refreshChangedCoverAssets(paths);
    }));
    this.renderLoading();
    try {
      await this.plugin.ensureCalendarReady();
      if (!this.opened) return;
      this.syncToFile(this.app.workspace.getActiveFile(), false);
      this.render();
      this.disposeDayWatch = watchDayChange(this.contentEl.ownerDocument.defaultView!, (previous, current) => {
        this.prepareRenderContext();
        if (this.marginTimeline) this.marginTimeline.refreshDates([previous, current], false);
        else this.render();
      });
    } catch (error) {
      if (this.opened) this.renderError(error);
    }
  }

  override async onClose(): Promise<void> {
    this.disposeDayWatch?.();
    this.disposeDayWatch = null;
    this.disposeMarginTally?.();
    this.disposeMarginTally = null;
    this.marginScroll = this.marginTimeline?.snapshot() ?? this.marginScroll;
    this.marginTimeline?.dispose();
    this.marginTimeline = null;
    this.marginLenses.clear();
    this.opened = false;
    this.cancelScheduledRender();
    this.flushViewState();
    this.containerEl.removeClass("daymark-calendar-container");
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.pendingChanges.take();
    this.coverCache.clear();
    this.coverThumbnails.dispose();
    this.bodyEl = null;
    this.footerEl = null;
  }

  private renderLoading(): void {
    this.bodyEl = null;
    this.footerEl = null;
    this.contentEl.empty();
    this.contentEl.addClass("daymark-calendar-view");
    this.contentEl.removeClass("has-footer");
    this.contentEl.createEl("p", { cls: "daymark-calendar-status", text: "Building journal index…" });
  }

  private renderError(error: unknown): void {
    this.bodyEl = null;
    this.footerEl = null;
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
    this.cancelScheduledRender();
    this.prepareCoverWorkForRender();
    this.pendingChanges.take();
    const renderVersion = ++this.renderVersion;
    this.prepareRenderContext();
    const weekStart = this.plugin.resolveWeekStart();
    const anchor = this.mode === "week" ? this.displayedWeek : this.displayedMonth;
    const bounds = getPeriodBounds(anchor, this.mode, weekStart);
    const aggregate = this.isMargin ? null : this.plugin.index.aggregate(bounds);
    const root = this.contentEl;
    const restoreMarginFocus = captureMarginFocus(root);
    this.dayCellSequence = 0;
    this.footerEl = null;
    this.marginScroll = this.marginTimeline?.snapshot() ?? this.marginScroll;
    this.marginTimeline?.dispose();
    this.marginTimeline = null;
    root.empty();
    root.addClass("daymark-calendar-view");
    root.toggleClass("is-margin-view", this.isMargin);
    root.toggleClass("is-week-view", this.mode === "week");
    root.toggleClass("is-month-view", this.mode === "month");
    root.toggleClass("is-year-view", this.mode === "year");
    root.toggleClass("is-tally-expanded", !this.isMargin && this.plugin.settings.tallyEnabled && this.tallyExpanded);
    root.toggleClass("has-footer", !this.isMargin
      && (this.plugin.settings.showCalendarTotals || this.plugin.settings.tallyEnabled));

    this.disposeMarginTally?.();
    this.disposeMarginTally = null;
    this.marginTallySlot = this.isMargin ? createMarginHeader(root, this.displayedMonth, this.plugin.locale, this.marginNavigation()) : null;
    if (!this.isMargin) this.createHeader(root, bounds);
    const body = root.createDiv("daymark-calendar-body");
    this.bodyEl = body;
    if (this.isMargin) {
      this.refreshMarginHeader();
      this.createMarginView(body);
    }
    else if (this.mode === "year") this.createYearView(body, weekStart, aggregate!);
    else if (this.mode === "month") this.createMonthView(body, weekStart);
    else this.createWeekView(body, weekStart);
    if (aggregate) this.createFooter(root, aggregate, renderVersion);
    restoreMarginFocus();
  }

  private marginContext(lens: MarginTallyLens | null): MarginCalendarContext {
    return {
      locale: this.plugin.locale,
      settings: this.plugin.settings,
      selectedIso: this.renderSelectedIso,
      todayIso: this.renderTodayIso,
      onSelect: (date) => this.selectDate(date, true),
      nameEditor: this.marginNameEditor,
      wireSeed: this.marginWireSeed,
      expandedLinks: this.marginExpandedLinks,
      onOpenLinkedNote: async (path, newLeaf) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") {
          new Notice("This linked note is no longer available.");
          return;
        }
        await this.app.workspace.getLeaf(newLeaf ? "tab" : false).openFile(file);
      },
      onNameChange: (iso, name) => this.plugin.setDayName(iso, name),
      lens
    };
  }

  private refreshMarginHeader(): void {
    const restoreFocus = captureMarginFocus(this.contentEl);
    updateMarginHeader(this.contentEl, this.displayedMonth, this.plugin.locale);
    const slot = this.marginTallySlot;
    if (!slot) return;
    if (!this.plugin.settings.tallyEnabled) {
      this.disposeMarginTally?.();
      this.disposeMarginTally = null;
      slot.empty();
      return;
    }
    const bounds = this.currentBounds();
    const aggregate = () => this.plugin.index.aggregate(bounds);
    const lenses = (id?: string) => marginTallyLenses(aggregate(), this.plugin.settings, this.plugin.locale, id);
    const lens = this.marginLensId
      ? resolveMarginLens(this.marginLensId, lenses(this.marginLensId), this.plugin.settings, this.plugin.locale) : null;
    const renderVersion = this.renderVersion;
    const controls: MarginTallyControls = {
      locale: this.plugin.locale, period: formatPeriodTitle(bounds, "month", this.plugin.locale),
      lenses, lens, expanded: this.marginTallyExpanded,
      onExpanded: expanded => {
        this.marginTallyExpanded = expanded;
        this.saveViewState();
        if (expanded) void this.plugin.ensureAdditionalWordsReady();
      },
      onLens: id => {
        this.marginLensId = id;
        this.marginTallyExpanded = false;
        this.saveViewState();
        this.render();
        this.contentEl.querySelector<HTMLElement>(".daymark-margin-tally-toggle")?.focus({ preventScroll: true });
      },
      reportAction: parent => this.inlineTally.createReportAction(parent, "month", aggregate(), renderVersion,
        version => this.opened && version === this.renderVersion),
      additionalWords: parent => this.inlineTally.createAdditionalWords(parent)
    };
    if (this.disposeMarginTally) this.disposeMarginTally.update(controls);
    else this.disposeMarginTally = createMarginTally(slot, controls);
    if (this.marginTallyExpanded) void this.plugin.ensureAdditionalWordsReady();
    restoreFocus();
  }

  private createMarginView(body: HTMLElement): void {
    const revealSelected = !this.marginScroll && this.dateIsInDisplayedMonth(this.selectedDate);
    const lenses = this.marginLenses;
    lenses.clear();
    this.marginTimeline = new MarginTimeline(body, {
      anchor: this.marginScroll ?? { date: toIsoDate(this.displayedMonth), fraction: 0 },
      expandedFoldDates: this.marginExpandedFolds,
      recordForDate: date => this.plugin.index.recordForDate(date),
      contextForMonth: month => {
        const key = toIsoDate(month);
        if (!lenses.has(key)) {
          const options = this.plugin.settings.tallyEnabled && this.marginLensId
            ? marginTallyLenses(this.plugin.index.aggregate(getPeriodBounds(month, "month", this.plugin.resolveWeekStart())),
              this.plugin.settings, this.plugin.locale, this.marginLensId) : [];
          lenses.set(key, this.plugin.settings.tallyEnabled
            ? resolveMarginLens(this.marginLensId, options, this.plugin.settings, this.plugin.locale) : null);
          // Scrolling through years must not retain every month's derived values.
          if (lenses.size > 12) lenses.delete(lenses.keys().next().value!);
        }
        return this.marginContext(lenses.get(key) ?? null);
      },
      onScroll: (anchor, focusDate) => {
        this.marginScroll = anchor;
        const month = firstOfMonth(focusDate);
        if (!datesEqual(month, this.displayedMonth)) {
          this.displayedMonth = month;
          ++this.renderVersion;
          this.refreshMarginHeader();
        }
        this.saveViewState();
      }
    });
    if (revealSelected) this.marginTimeline.scrollToDate(this.selectedDate);
  }

  private marginNavigation() {
    return {
      onToday: () => this.selectDate(todayPlainDate(), false, "center")
    };
  }

  private selectMarginDate(date: PlainDate, align: "nearest" | "center" = "nearest"): void {
    const previousIso = toIsoDate(this.selectedDate);
    this.selectedDate = date;
    this.displayedWeek = date;
    this.renderSelectedIso = toIsoDate(date);
    this.marginTimeline?.scrollToDate(date, align);
    this.updateVisibleSelection(previousIso, this.renderSelectedIso);
    this.saveViewState();
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
      this.showDate(todayPlainDate());
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
      weekdays.createSpan({
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
  }

  private createYearView(parent: HTMLElement, weekStart: Weekday, aggregate: PeriodAggregate): void {
    this.createYearSection(parent, this.displayedMonth.year, weekStart, aggregate);
  }

  private createYearSection(
    parent: HTMLElement,
    year: number,
    weekStart: Weekday,
    aggregate: PeriodAggregate
  ): void {
    const section = parent.createDiv("daymark-year-section");
    const months = section.createDiv("daymark-year-months");
    const activityIndex = calendarYearActivityIndex(aggregate.noteSources, aggregate.wordSources);
    for (let month = 1; month <= 12; month += 1) {
      const first = { year, month, day: 1 };
      const dates = calendarYearActivityDates(first, weekStart);
      const noteCount = activityIndex.monthNoteCounts[month - 1] ?? 0;
      const wordCount = activityIndex.monthWordCounts[month - 1] ?? 0;
      const monthLabel = this.monthFormatter.format(toDate(first));
      const selectedMonth = this.selectedDate.year === year && this.selectedDate.month === month;
      const selectedDateDescription = selectedMonth
        ? ` Selected date ${this.fullDateFormatter.format(toDate(this.selectedDate))}.`
        : "";
      const button = months.createEl("button", {
        cls: `daymark-year-month${selectedMonth ? " is-selected-month" : ""}`
      });
      button.dataset.month = toIsoDate(first);
      button.setAttr(
        "aria-label",
        `${monthLabel} ${year}, ${noteCount} ${noteCount === 1 ? "daily note" : "daily notes"}, ${wordCount} ${wordCount === 1 ? "word" : "words"}.${selectedDateDescription} Show month view.`
      );
      const title = button.createSpan("daymark-year-month-title");
      title.createSpan({ cls: "daymark-year-month-label", text: monthLabel });
      if (selectedMonth) {
        title.createSpan({ cls: "daymark-year-selected-day", text: String(this.selectedDate.day) });
      }
      const activity = button.createSpan("daymark-year-activity");
      activity.setAttr("aria-hidden", "true");

      for (let index = 0; index < dates.length; index += 1) {
        const date = dates[index];
        if (!date) {
          activity.createSpan("daymark-year-mark is-empty");
          continue;
        }
        const isoDate = toIsoDate(date);
        const hasNote = activityIndex.noteDates.has(isoDate);
        const words = activityIndex.wordsByDate.get(isoDate) ?? 0;
        const weekday = ((weekStart + index) % 7) as Weekday;
        const intensity = yearWritingIntensity(words, activityIndex.busiestDayWords);
        let classes = "daymark-year-mark";
        if (this.weekdayIsHighlighted(weekday)) classes += " is-highlighted";
        if (hasNote) classes += " has-note";
        if (intensity) classes += ` has-writing-${intensity}`;
        if (isoDate === this.renderTodayIso) classes += " is-today";
        if (isoDate === this.renderSelectedIso) classes += " is-selected";
        const mark = activity.createSpan(classes);
        mark.dataset.date = isoDate;
      }

      button.addEventListener("click", () => {
        this.displayedMonth = first;
        this.setMode("month");
      });
    }
  }

  private createWeekView(parent: HTMLElement, weekStart: Weekday): void {
    const currentWeek = getPeriodBounds(this.displayedWeek, "week", weekStart).start;
    const section = parent.createDiv("daymark-week-section");
    const list = section.createDiv("daymark-week-list");
    for (const date of calendarWeekDates(currentWeek, weekStart)) {
      this.createWeekRow(list, date, this.plugin.index.recordForDate(date));
    }
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
    const highlighted = this.weekdayIsHighlighted(weekday);
    const cover = record && this.plugin.settings.showCoverPhotos ? this.firstCoverFile(record) : null;
    let classes = "daymark-calendar-day";
    if (outside) classes += " is-outside-month";
    if (selected) classes += " is-selected";
    if (today) classes += " is-today";
    if (weekday === 0 || weekday === 6) classes += " is-weekend";
    if (highlighted) classes += " is-highlighted";
    if (record) classes += " has-note";
    const button = parent.createEl("button", { cls: classes });
    button.dataset.date = isoDate;
    button.setAttr("role", "gridcell");
    button.setAttr("aria-selected", String(selected));
    const label = button.createSpan({
      cls: "daymark-visually-hidden",
      text: this.dayLabel(date, record)
    });
    label.id = `${this.accessibleId}-${++this.dayCellSequence}-${isoDate}`;
    button.setAttr("aria-labelledby", label.id);
    if (today) button.setAttr("aria-current", "date");
    if (cover) {
      this.createCoverImage(button, "daymark-calendar-day-cover", cover);
    }
    button.createSpan({ cls: "daymark-calendar-day-number", text: String(date.day) });
    button.addEventListener("click", () => {
      this.selectDate(date, true);
    });
  }

  private createWeekRow(parent: HTMLElement, date: PlainDate, record: DailyRecord | null): void {
    const isoDate = toIsoDate(date);
    const weekday = toDate(date).getUTCDay() as Weekday;
    const selected = isoDate === this.renderSelectedIso;
    const today = isoDate === this.renderTodayIso;
    const highlighted = this.weekdayIsHighlighted(weekday);
    const cover = record && this.plugin.settings.showCoverPhotos ? this.firstCoverFile(record) : null;
    let classes = "daymark-week-row";
    if (selected) classes += " is-selected";
    if (today) classes += " is-today";
    if (highlighted) classes += " is-highlighted";
    if (record) classes += " has-note";
    const row = parent.createEl("button", { cls: classes });
    row.dataset.date = isoDate;
    const label = row.createSpan({
      cls: "daymark-visually-hidden",
      text: this.dayLabel(date, record)
    });
    label.id = `${this.accessibleId}-week-${isoDate}`;
    row.setAttr("aria-labelledby", label.id);
    row.setAttr("aria-pressed", String(selected));
    if (today) row.setAttr("aria-current", "date");

    const tile = row.createSpan("daymark-week-date-tile");
    if (cover) {
      this.createCoverImage(row, "daymark-week-date-cover", cover, tile);
    }
    tile.createSpan({ cls: "daymark-week-date-number", text: String(date.day) });

    const details = row.createSpan("daymark-week-details");
    const weekdayLabel = details.createSpan({ cls: "daymark-week-weekday" });
    weekdayLabel.createSpan({
      cls: "daymark-week-weekday-long",
      text: this.longWeekdayNames[weekday] ?? ""
    });
    weekdayLabel.createSpan({
      cls: "daymark-week-weekday-short",
      text: this.shortWeekdayNames[weekday] ?? ""
    });
    const metrics = details.createSpan({
      cls: `daymark-week-metrics${record ? "" : " is-empty"}`
    });
    if (record) {
      metrics.createSpan({
        text: `${this.formatNumber(record.words)} ${record.words === 1 ? "word" : "words"}`
      });
      if (record.totalCheckboxes > 0) {
        metrics.createSpan({
          text: `${this.formatNumber(record.completedCheckboxes)}/${this.formatNumber(record.totalCheckboxes)} checked`
        });
      }
    } else {
      metrics.setText("No note");
    }

    row.addEventListener("click", () => {
      this.selectDate(date, true);
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
    const metadata = this.app.metadataCache.getFileCache(note);
    const cached = this.coverCache.get(record.path);
    const cachedCoverExists = !cached?.cover
      || this.app.vault.getAbstractFileByPath(cached.cover.path) === cached.cover;
    if (cached?.metadata === metadata && cachedCoverExists) {
      this.coverCache.delete(record.path);
      this.coverCache.set(record.path, cached);
      return cached.cover;
    }
    const embeds = metadata?.embeds ?? [];
    let cover: TFile | null = null;
    for (const embed of embeds) {
      const file = this.app.metadataCache.getFirstLinkpathDest(embed.link, note.path);
      if (file && isSupportedCoverPath(file.path)) {
        cover = file;
        break;
      }
    }
    this.coverCache.set(record.path, { metadata, cover });
    while (this.coverCache.size > 256) {
      const oldest = this.coverCache.keys().next().value;
      if (oldest === undefined) break;
      this.coverCache.delete(oldest);
    }
    return cover;
  }

  private createCoverImage(
    owner: HTMLElement,
    className: string,
    cover: TFile,
    parent = owner
  ): void {
    const source = this.coverThumbnailSource(cover);
    const fingerprint = coverThumbnailFingerprint(source, this.coverThumbnails.dimension);
    const image = parent.createEl("img", { cls: className });
    image.setAttr("alt", "");
    image.setAttr("aria-hidden", "true");
    image.setAttr("decoding", "async");
    image.setAttr("loading", "lazy");
    image.dataset.coverPath = cover.path;
    image.dataset.coverFingerprint = fingerprint;

    const resolution = resolveCoverThumbnail(
      this.plugin.settings.showCoverPhotos,
      this.coverThumbnails,
      source
    );
    if (resolution.url) {
      image.src = resolution.url;
      owner.addClass("has-cover");
      return;
    }
    if (!resolution.pending) return;
    void resolution.pending.then((url) => {
      if (applyCoverThumbnail(image, fingerprint, url)) owner.addClass("has-cover");
    });
  }

  private coverThumbnailSource(cover: TFile): CoverThumbnailSource {
    return {
      path: cover.path,
      mtime: cover.stat.mtime,
      size: cover.stat.size
    };
  }

  private async generateCoverThumbnail(
    source: CoverThumbnailSource,
    dimension: number
  ): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(source.path);
    if (!(file instanceof TFile)
      || file.stat.mtime !== source.mtime
      || file.stat.size !== source.size) return null;
    const bytes = await this.app.vault.readBinary(file);
    const current = this.app.vault.getAbstractFileByPath(source.path);
    if (!(current instanceof TFile)
      || current.stat.mtime !== source.mtime
      || current.stat.size !== source.size) return null;
    return generateCoverThumbnailUrl(bytes, source.path, dimension);
  }

  private createFooter(parent: HTMLElement, aggregate: PeriodAggregate, renderVersion: number): void {
    this.footerEl = null;
    if (this.isMargin) return;
    if (!this.plugin.settings.showCalendarTotals && !this.plugin.settings.tallyEnabled) return;

    const footer = parent.createDiv("daymark-calendar-footer");
    this.footerEl = footer;
    const expanded = this.plugin.settings.tallyEnabled && this.tallyExpanded;
    footer.toggleClass("is-expanded", expanded);

    if (!expanded) {
      if (this.plugin.settings.tallyEnabled) this.createTallyToggle(footer, false);
      else footer.addClass("is-tally-hidden");
      if (this.plugin.settings.showCalendarTotals) {
        const summary = formatCalendarFooterSummary(aggregate, this.plugin.locale);
        const stats = footer.createSpan({ cls: "daymark-calendar-selected-stats" });
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
    void this.plugin.ensureAdditionalWordsReady();
  }

  private createTallyToggle(parent: HTMLElement, expanded: boolean): void {
    const tally = parent.createEl("button", { cls: "daymark-calendar-tally" });
    tally.setAttr("type", "button");
    tally.setAttr("aria-expanded", String(expanded));
    if (expanded) tally.setAttr("aria-controls", `${this.accessibleId}-tally-panel`);
    tally.setAttr("aria-label", expanded ? "Collapse Tally" : "Expand Tally");
    tally.createSpan({ cls: "daymark-calendar-tally-label", text: "Tally" });
    const chevron = tally.createSpan({ cls: "daymark-calendar-tally-chevron" });
    setIcon(chevron, expanded ? "chevron-up" : "chevron-down");
    tally.addEventListener("click", () => {
      this.tallyExpanded = !expanded;
      this.saveViewState();
      this.renderFooterOnly();
    });
  }

  private renderFooterOnly(): void {
    if (!this.opened) return;
    if (this.isMargin) { ++this.renderVersion; this.refreshMarginHeader(); return; }
    const weekStart = this.plugin.resolveWeekStart();
    const anchor = this.mode === "week" ? this.displayedWeek : this.displayedMonth;
    const bounds = getPeriodBounds(anchor, this.mode, weekStart);
    const aggregate = this.plugin.index.aggregate(bounds);
    const renderVersion = ++this.renderVersion;
    this.contentEl.toggleClass(
      "is-tally-expanded",
      this.plugin.settings.tallyEnabled && this.tallyExpanded
    );
    this.contentEl.toggleClass("has-footer", this.plugin.settings.showCalendarTotals || this.plugin.settings.tallyEnabled);
    this.footerEl?.remove();
    this.footerEl = null;
    this.createFooter(this.contentEl, aggregate, renderVersion);
  }

  private formatNumber(value: number): string {
    return this.numberFormatter.format(value);
  }

  private renderBodyOnly(): void {
    if (!this.opened || !this.bodyEl) return;
    if (this.isMargin) { this.render(); return; }
    this.prepareCoverWorkForRender();
    this.prepareRenderContext();
    const weekStart = this.plugin.resolveWeekStart();
    const bounds = this.currentBounds(weekStart);
    const aggregate = this.plugin.index.aggregate(bounds);
    const body = createDiv();
    body.className = "daymark-calendar-body";
    if (this.mode === "year") this.createYearView(body, weekStart, aggregate);
    else if (this.mode === "month") this.createMonthView(body, weekStart);
    else this.createWeekView(body, weekStart);
    this.bodyEl.replaceWith(body);
    this.bodyEl = body;
  }

  private refreshYearView(): void {
    if (!this.opened || !this.bodyEl || this.mode !== "year") return;
    this.prepareRenderContext();
    const aggregate = this.plugin.index.aggregate(this.currentBounds());
    const activityIndex = calendarYearActivityIndex(aggregate.noteSources, aggregate.wordSources);
    const monthButtons = this.bodyEl.querySelectorAll<HTMLElement>(".daymark-year-month[data-month]");
    if (monthButtons.length !== 12) {
      this.renderBodyOnly();
      return;
    }

    monthButtons.forEach((button) => {
      const first = button.dataset.month ? parseIsoDate(button.dataset.month) : null;
      if (!first) return;
      const monthIndex = first.month - 1;
      const noteCount = activityIndex.monthNoteCounts[monthIndex] ?? 0;
      const wordCount = activityIndex.monthWordCounts[monthIndex] ?? 0;
      const monthLabel = this.monthFormatter.format(toDate(first));
      const selectedMonth = this.selectedDate.year === first.year && this.selectedDate.month === first.month;
      const selectedDateDescription = selectedMonth
        ? ` Selected date ${this.fullDateFormatter.format(toDate(this.selectedDate))}.`
        : "";
      button.toggleClass("is-selected-month", selectedMonth);
      button.setAttr(
        "aria-label",
        `${monthLabel} ${first.year}, ${noteCount} ${noteCount === 1 ? "daily note" : "daily notes"}, ${wordCount} ${wordCount === 1 ? "word" : "words"}.${selectedDateDescription} Show month view.`
      );
      const title = button.querySelector(".daymark-year-month-title");
      const selectedDay = title?.querySelector(".daymark-year-selected-day");
      if (selectedMonth) {
        if (selectedDay) selectedDay.setText(String(this.selectedDate.day));
        else title?.createSpan({ cls: "daymark-year-selected-day", text: String(this.selectedDate.day) });
      } else {
        selectedDay?.remove();
      }
    });

    const yearMarks = this.bodyEl.querySelectorAll<HTMLElement>(".daymark-year-mark[data-date]");
    yearMarks.forEach((mark) => {
      const isoDate = mark.dataset.date;
      if (!isoDate) return;
      const words = activityIndex.wordsByDate.get(isoDate) ?? 0;
      const intensity = yearWritingIntensity(words, activityIndex.busiestDayWords);
      mark.toggleClass("has-note", activityIndex.noteDates.has(isoDate));
      mark.removeClass("has-writing-low", "has-writing-medium", "has-writing-high");
      if (intensity) mark.addClass(`has-writing-${intensity}`);
      mark.toggleClass("is-today", isoDate === this.renderTodayIso);
      mark.toggleClass("is-selected", isoDate === this.renderSelectedIso);
    });
  }

  private patchVisibleDates(dates: readonly string[], bounds: ReturnType<typeof getPeriodBounds>): void {
    if (!this.bodyEl) return;
    // Margin's dedicated incremental path handles ordinary date updates.
    if (this.isMargin) { this.render(); return; }
    let missedDateInPeriod = false;
    const start = toIsoDate(bounds.start);
    const end = toIsoDate(bounds.end);
    for (const isoDate of dates) {
      const date = parseIsoDate(isoDate);
      if (!date) continue;
      const current = this.bodyEl.querySelector<HTMLElement>(`[data-date="${isoDate}"]`);
      if (!current) {
        if (isoDate >= start && isoDate < end) missedDateInPeriod = true;
        continue;
      }
      const holder = createDiv();
      const record = this.plugin.index.recordForDate(date);
      if (this.mode === "month") this.createDay(holder, date, record, this.displayedMonth);
      else this.createWeekRow(holder, date, record);
      const replacement = holder.firstElementChild;
      if (replacement) {
        this.preserveMatchingCover(current, replacement);
        current.replaceWith(replacement);
      }
    }
    if (missedDateInPeriod) this.renderBodyOnly();
  }

  private currentBounds(weekStart = this.plugin.resolveWeekStart()): ReturnType<typeof getPeriodBounds> {
    const anchor = this.mode === "week" ? this.displayedWeek : this.displayedMonth;
    return getPeriodBounds(anchor, this.mode, weekStart);
  }

  private preserveMatchingCover(current: HTMLElement, replacement: Element): void {
    const currentCover = current.querySelector("img");
    const replacementCover = replacement.querySelector("img");
    if (currentCover && replacementCover && currentCover.src === replacementCover.src) {
      replacementCover.replaceWith(currentCover);
    }
  }

  private prepareCoverWorkForRender(): void {
    if (this.plugin.settings.showCoverPhotos) this.coverThumbnails.cancelPending();
    else this.coverThumbnails.clear();
  }

  private refreshChangedCoverAssets(paths: readonly string[]): void {
    const changed = new Set(paths);
    for (const path of changed) this.coverThumbnails.invalidatePath(path);
    for (const [notePath, cached] of this.coverCache) {
      if (cached.cover && changed.has(cached.cover.path)) this.coverCache.delete(notePath);
    }
    if (!this.opened || !this.plugin.settings.showCoverPhotos || !this.bodyEl || this.mode === "year") return;
    const dates = new Set<string>();
    this.bodyEl.querySelectorAll<HTMLImageElement>("img[data-cover-path]").forEach((image) => {
      const path = image.dataset.coverPath;
      if (!path || !changed.has(path)) return;
      const dated = image.closest("[data-date]") as unknown;
      const date = dated instanceof HTMLElement ? dated.dataset.date : undefined;
      if (date) dates.add(date);
    });
    if (dates.size > 0) this.patchVisibleDates([...dates], this.currentBounds());
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
    this.highlightedWeekdayMask = 0;
    for (const weekday of this.plugin.settings.highlightedWeekdays) {
      this.highlightedWeekdayMask |= 1 << weekday;
    }
  }

  private weekdayIsHighlighted(weekday: number): boolean {
    return (this.highlightedWeekdayMask & (1 << weekday)) !== 0;
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
    this.selectDate(date, false);
  }

  syncPriorityForDates(dates: Iterable<string>): 0 | 1 | 2 {
    return syncDatePriority(dates, toIsoDate(this.selectedDate), this.currentBounds());
  }

  showPeriod(mode: PeriodMode, anchor: PlainDate): void {
    this.mode = mode;
    this.displayedMonth = firstOfMonth(anchor);
    this.displayedWeek = anchor;
    this.tallyExpanded = true;
    if (this.isMargin) this.marginTimeline?.scrollToDate(firstOfMonth(anchor), "center");
    this.saveViewState();
    this.render();
  }

  expandTally(): void {
    if (this.tallyExpanded) return;
    this.tallyExpanded = true;
    this.saveViewState();
    this.renderFooterOnly();
    if (this.isMargin) this.contentEl.querySelector<HTMLElement>(".daymark-margin-tally-item")?.focus({ preventScroll: true });
  }

  async saveCurrentTallyPeriod(): Promise<void> {
    const today = todayPlainDate();
    this.displayedMonth = firstOfMonth(today);
    this.displayedWeek = today;
    if (this.isMargin) this.marginTimeline?.scrollToDate(firstOfMonth(today), "center");
    this.tallyExpanded = true;
    this.saveViewState();
    await this.plugin.ensureCalendarReady();
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
    if (this.isMargin) {
      if (shouldRender && this.marginTimeline) {
        // File-open after a date click must not scroll that date a second time.
        if (!datesEqual(this.selectedDate, date)) this.selectMarginDate(date);
        return;
      }
      if (!shouldRender && this.marginScroll) {
        this.selectedDate = date;
        this.displayedWeek = date;
        return;
      }
    }
    const displayedMonth = firstOfMonth(date);
    if (datesEqual(this.selectedDate, date)
      && datesEqual(this.displayedMonth, displayedMonth)
      && datesEqual(this.displayedWeek, date)) return;
    const previousIso = toIsoDate(this.selectedDate);
    const staysInPeriod = this.dateStaysInVisiblePeriod(date);
    this.applyViewportState(selectCalendarDate(date));
    this.saveViewState();
    if (!shouldRender) return;
    if (!staysInPeriod) this.render();
    else if (this.mode === "year") this.refreshYearView();
    else this.updateVisibleSelection(previousIso, toIsoDate(date));
  }

  private selectDate(date: PlainDate, openNote: boolean, marginAlign: "nearest" | "center" = "nearest"): void {
    if (this.isMargin && this.marginTimeline) {
      this.selectMarginDate(date, marginAlign);
      if (openNote) void this.plugin.openOrCreateDailyNote(date);
      return;
    }
    const previousIso = toIsoDate(this.selectedDate);
    const staysInPeriod = this.dateStaysInVisiblePeriod(date);
    this.applyViewportState(selectCalendarDate(date));
    this.saveViewState();
    if (!staysInPeriod) this.render();
    else if (this.mode === "year") this.refreshYearView();
    else this.updateVisibleSelection(previousIso, toIsoDate(date));
    if (openNote) void this.plugin.openOrCreateDailyNote(date);
  }

  private dateStaysInVisiblePeriod(date: PlainDate): boolean {
    if (this.mode === "month") return this.dateIsInDisplayedMonth(date);
    if (this.mode === "year") return date.year === this.displayedMonth.year;
    return dateIsWithin(date, this.currentBounds());
  }

  private updateVisibleSelection(previousIso: string, selectedIso: string): void {
    if (!this.bodyEl) return;
    this.renderSelectedIso = selectedIso;
    const previous = this.bodyEl.querySelector<HTMLElement>(`[data-date="${previousIso}"]`);
    const selected = this.bodyEl.querySelector<HTMLElement>(`[data-date="${selectedIso}"]`);
    previous?.removeClass("is-selected");
    selected?.addClass("is-selected");
    if (this.mode === "month" && !this.isMargin) {
      previous?.setAttr("aria-selected", "false");
      selected?.setAttr("aria-selected", "true");
    } else {
      const previousButton = this.isMargin ? previous?.querySelector(".daymark-margin-date") : previous;
      const selectedButton = this.isMargin ? selected?.querySelector(".daymark-margin-date") : selected;
      previousButton?.setAttr("aria-pressed", "false");
      selectedButton?.setAttr("aria-pressed", "true");
    }
  }

  private schedulePluginChange(change: DaymarkChangeSet): void {
    if (!this.opened) return;
    this.pendingChanges.add(change);
    if (this.renderFrame !== null) return;
    this.renderFrame = window.requestAnimationFrame(() => {
      this.renderFrame = null;
      const pending = this.pendingChanges.take();
      if (pending) this.applyPluginChange(pending);
    });
  }

  private applyPluginChange(change: DaymarkChangeSet): void {
    for (const path of change.dailyPaths) this.coverCache.delete(path);
    if (change.full) {
      this.render();
      return;
    }

    const bounds = this.currentBounds();
    const affectsPeriod = changeAffectsBounds(change, bounds);
    const coverDates = this.plugin.settings.showCoverPhotos ? change.coverDates : [];
    const visibleDates = coverDates.length === 0
      ? change.dailyDates
      : [...new Set([...change.dailyDates, ...coverDates])];
    if (this.isMargin) {
      // Invalidate only affected months; report/additional-word updates leave lenses intact.
      for (const iso of visibleDates) this.marginLenses.delete(`${iso.slice(0, 7)}-01`);
      if (!this.marginTimeline) { this.render(); return; }
      const restoreFocus = captureMarginFocus(this.contentEl);
      const previousToday = this.renderTodayIso;
      this.prepareRenderContext();
      // Update affected dates; lens scales also refresh their months.
      const dates = previousToday && previousToday !== this.renderTodayIso
        ? [...visibleDates, previousToday, this.renderTodayIso] : visibleDates;
      this.marginTimeline.refreshDates(dates, this.plugin.settings.tallyEnabled && this.marginLensId !== null);
      if (affectsPeriod || (this.tallyExpanded && (change.additionalWords || change.reportPaths.length > 0))) this.renderFooterOnly();
      restoreFocus();
      return;
    }
    if (change.dailyDates.length > 0 || (this.mode !== "year" && visibleDates.length > 0)) {
      this.prepareRenderContext();
      if (this.mode === "year") {
        if (affectsPeriod) this.refreshYearView();
      } else {
        this.patchVisibleDates(visibleDates, bounds);
      }
    }
    if (affectsPeriod
      || (change.additionalWords && this.tallyExpanded)
      || (change.reportPaths.length > 0 && this.tallyExpanded)) this.renderFooterOnly();
  }

  private cancelScheduledRender(): void {
    if (this.renderFrame === null) return;
    window.cancelAnimationFrame(this.renderFrame);
    this.renderFrame = null;
  }

  private saveViewState(): void {
    if (this.layoutSaveTimer !== null) window.clearTimeout(this.layoutSaveTimer);
    this.layoutSaveTimer = window.setTimeout(() => this.flushViewState(), 250);
  }

  private flushViewState(): void {
    if (this.layoutSaveTimer === null) return;
    window.clearTimeout(this.layoutSaveTimer);
    this.layoutSaveTimer = null;
    void this.app.workspace.requestSaveLayout();
  }

}
