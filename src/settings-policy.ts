import type { DaymarkSettings } from "./types";

export function settingsAreEqual(left: DaymarkSettings, right: DaymarkSettings): boolean {
  return left.journalFolder === right.journalFolder
    && left.dateFormat === right.dateFormat
    && left.templatePath === right.templatePath
    && left.additionalWordFolder === right.additionalWordFolder
    && left.weekStart === right.weekStart
    && left.highlightedWeekdays.length === right.highlightedWeekdays.length
    && left.highlightedWeekdays.every((weekday, index) => weekday === right.highlightedWeekdays[index])
    && left.showCoverPhotos === right.showCoverPhotos
    && left.showSelectedDayStats === right.showSelectedDayStats
    && left.tallyEnabled === right.tallyEnabled;
}

export function settingsRequireRebuild(previous: DaymarkSettings, next: DaymarkSettings): boolean {
  return previous.journalFolder !== next.journalFolder || previous.dateFormat !== next.dateFormat;
}

export function settingsRequireAdditionalWordRebuild(previous: DaymarkSettings, next: DaymarkSettings): boolean {
  return previous.additionalWordFolder !== next.additionalWordFolder;
}
