export type PeriodMode = "week" | "month" | "year";
export type CalendarLayout = "standard" | "margin";

export type WeekStartSetting = "locale" | "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PlainDate {
  year: number;
  month: number;
  day: number;
}

export interface PeriodBounds {
  start: PlainDate;
  end: PlainDate;
}

export interface TaggedValue {
  tag: string;
  value: number;
}

export interface LinkedNote { path: string; title: string }

export interface DailyRecord {
  path: string;
  basename: string;
  date: PlainDate;
  isoDate: string;
  words: number;
  photos: number;
  linkedWords?: number;
  linkedNoteCount?: number;
  linkedNotes?: readonly LinkedNote[];
  linkedWritingStatus?: "loading" | "unavailable";
  totalCheckboxes: number;
  completedCheckboxes: number;
  taggedValues: TaggedValue[];
}

export interface DailyMetricSource {
  date: PlainDate;
  isoDate: string;
  path: string;
  value: number;
}

export interface AggregateTagSource extends TaggedValue {
  date: PlainDate;
  isoDate: string;
  path: string;
}

export interface TagAggregate {
  tag: string;
  total: number;
  sources: AggregateTagSource[];
}

export interface PeriodAggregate {
  bounds: PeriodBounds;
  noteCount: number;
  notePaths: string[];
  noteSources: DailyMetricSource[];
  words: number;
  photos: number;
  totalCheckboxes: number;
  completedCheckboxes: number;
  wordSources: DailyMetricSource[];
  photoSources: DailyMetricSource[];
  checkboxSources: DailyMetricSource[];
  tags: TagAggregate[];
}

export interface DaymarkSettings {
  settingsVersion: number;
  journalFolder: string;
  dateFormat: string;
  templatePath: string;
  additionalWordFolder: string;
  weekStart: WeekStartSetting;
  highlightedWeekdays: Weekday[];
  showCoverPhotos: boolean;
  calendarLayout: CalendarLayout;
  dayNames: Record<string, string>;
  showCalendarTotals: boolean;
  tallyEnabled: boolean;
  tallyMetricLabels: Partial<Record<TallyMetric, string>>;
  tallyTagLabels: Record<string, string>;
}

export type TallyMetric = "dailyNotes" | "words" | "photos";

export const DEFAULT_SETTINGS: DaymarkSettings = {
  settingsVersion: 5,
  journalFolder: "Journal",
  dateFormat: "YYYY-MM-DD",
  templatePath: "",
  additionalWordFolder: "",
  weekStart: "locale",
  highlightedWeekdays: [],
  showCoverPhotos: true,
  calendarLayout: "standard",
  dayNames: {},
  showCalendarTotals: true,
  tallyEnabled: true,
  tallyMetricLabels: {},
  tallyTagLabels: {}
};
