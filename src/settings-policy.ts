import type { DaymarkSettings } from "./types";
import { tallyMetricLabelsAreEqual, tallyTagLabelsAreEqual } from "./format";

export function settingsAreEqual(left: DaymarkSettings, right: DaymarkSettings): boolean {
  return left.settingsVersion === right.settingsVersion
    && left.journalFolder === right.journalFolder
    && left.dateFormat === right.dateFormat
    && left.templatePath === right.templatePath
    && left.additionalWordFolder === right.additionalWordFolder
    && left.weekStart === right.weekStart
    && left.highlightedWeekdays.length === right.highlightedWeekdays.length
    && left.highlightedWeekdays.every((weekday, index) => weekday === right.highlightedWeekdays[index])
    && left.showCoverPhotos === right.showCoverPhotos
    && left.showCalendarTotals === right.showCalendarTotals
    && left.tallyEnabled === right.tallyEnabled
    && tallyMetricLabelsAreEqual(left.tallyMetricLabels, right.tallyMetricLabels)
    && tallyTagLabelsAreEqual(left.tallyTagLabels, right.tallyTagLabels);
}

export function settingsRequireRebuild(previous: DaymarkSettings, next: DaymarkSettings): boolean {
  return previous.journalFolder !== next.journalFolder || previous.dateFormat !== next.dateFormat;
}

export function settingsRequireAdditionalWordRebuild(previous: DaymarkSettings, next: DaymarkSettings): boolean {
  return next.tallyEnabled && (
    previous.additionalWordFolder !== next.additionalWordFolder
    || (!previous.tallyEnabled && next.additionalWordFolder.length > 0)
  );
}
