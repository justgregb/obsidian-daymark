import { bench, describe } from "vitest";
import { aggregateRecords } from "../src/aggregate";
import { getPeriodBounds } from "../src/date";
import { marginTallyLenses } from "../src/margin-tally";
import { DEFAULT_SETTINGS, type DailyRecord } from "../src/types";

const records: DailyRecord[] = Array.from({ length: 30 }, (_, i) => {
  const isoDate = `2026-09-${String(i + 1).padStart(2, "0")}`;
  return { path: `${isoDate}.md`, basename: isoDate, isoDate, date: { year: 2026, month: 9, day: i + 1 },
    words: 100, photos: 2, totalCheckboxes: 3, completedCheckboxes: 2,
    taggedValues: Array.from({ length: 100 }, (_, tag) => ({ tag: `activity-${tag}`, value: (i + tag) % 4 })) };
});
const aggregate = aggregateRecords(records, getPeriodBounds(records[0].date, "month", 1));

describe("Margin: 30 days, 100 activity tags, one active lens", () => {
  bench("previous full-list calculation", () => {
    marginTallyLenses(aggregate, DEFAULT_SETTINGS, "en").find(lens => lens.id === "tag:activity-50");
  }, { time: 400, warmupTime: 100 });
  bench("selected-lens calculation", () => {
    marginTallyLenses(aggregate, DEFAULT_SETTINGS, "en", "tag:activity-50");
  }, { time: 400, warmupTime: 100 });
});
