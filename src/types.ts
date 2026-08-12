export type PeriodMode = "week" | "month" | "year";

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

export interface TaggedTaskSource {
  tag: string;
  value: number;
  text: string;
  line: number;
}

export interface DailyRecord {
  path: string;
  basename: string;
  date: PlainDate;
  isoDate: string;
  words: number;
  totalCheckboxes: number;
  completedCheckboxes: number;
  taggedTasks: TaggedTaskSource[];
}

export interface DailyMetricSource {
  date: PlainDate;
  isoDate: string;
  path: string;
  value: number;
}

export interface AggregateTaskSource extends TaggedTaskSource {
  date: PlainDate;
  isoDate: string;
  path: string;
}

export interface TagAggregate {
  tag: string;
  total: number;
  sources: AggregateTaskSource[];
}

export interface PeriodAggregate {
  bounds: PeriodBounds;
  noteCount: number;
  notePaths: string[];
  noteSources: DailyMetricSource[];
  words: number;
  totalCheckboxes: number;
  completedCheckboxes: number;
  wordSources: DailyMetricSource[];
  checkboxSources: DailyMetricSource[];
  tags: TagAggregate[];
}

export interface DaymarkSettings {
  journalFolder: string;
  dateFormat: string;
  templatePath: string;
  additionalWordFolder: string;
  weekStart: WeekStartSetting;
  highlightedWeekdays: Weekday[];
  showCoverPhotos: boolean;
  showSelectedDayStats: boolean;
  tallyEnabled: boolean;
}

export const DEFAULT_SETTINGS: DaymarkSettings = {
  journalFolder: "Journal",
  dateFormat: "YYYY-MM-DD",
  templatePath: "",
  additionalWordFolder: "",
  weekStart: "locale",
  highlightedWeekdays: [],
  showCoverPhotos: true,
  showSelectedDayStats: true,
  tallyEnabled: true
};
