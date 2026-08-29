import { bench, describe } from "vitest";
import { addDays, getPeriodBounds } from "../src/date";
import { parseDailyNote } from "../src/parser";
import { DaymarkStore } from "../src/store";
import { prioritizeOperations } from "../src/sync-scheduler";
import type { DailyRecord, PlainDate } from "../src/types";

const SIZES = [100, 1_000, 5_000] as const;
const CENTER_DATE: PlainDate = { year: 2026, month: 8, day: 20 };
const YEAR_BOUNDS = getPeriodBounds({ year: 2026, month: 8, day: 1 }, "year", 1);
const NOTE_CONTENT = [
  "---",
  "mood: calm",
  "---",
  "A quiet morning with a few lines of ordinary journal prose.",
  "",
  "![Harbour](Photos/harbour.jpg)",
  "",
  "- [x] Cycled 14 km #cycling",
  "- [x] Greek lesson #language-lessons",
  "- [ ] Buy coffee",
  "",
  "Another paragraph with a [[Visible link label]] and [Markdown link](https://example.com)."
].join("\n");

for (const size of SIZES) {
  const targetIndex = Math.floor(size / 2);
  const startDate = addDays(CENTER_DATE, -targetIndex);
  const dates = Array.from({ length: size }, (_, index) => addDays(startDate, index));
  const records = dates.map((date, index) => createRecord(date, index));
  const syncOperations = dates.map((date, index) => ({
    path: pathFor(date),
    priority: index === targetIndex ? 0 : index % 31 === 0 ? 1 : 2
  }));

  describe(`${size.toLocaleString()} daily notes`, () => {
    const rebuildStore = new DaymarkStore();
    bench("parse and store rebuild", () => {
      const parsed = new Array<DailyRecord>(dates.length);
      for (let index = 0; index < dates.length; index += 1) {
        const date = dates[index];
        parsed[index] = parseDailyNote(pathFor(date), pathFor(date).slice(8, -3), date, NOTE_CONTENT, "en");
      }
      rebuildStore.replace(parsed);
    }, { time: 250, warmupTime: 100 });

    const store = new DaymarkStore();
    store.replace(records);
    let revision = 0;
    bench("incremental refresh and year aggregate", () => {
      revision += 1;
      const original = records[targetIndex];
      store.upsert({ ...original, words: original.words + revision });
      store.aggregate(YEAR_BOUNDS);
    }, { time: 250, warmupTime: 100 });

    bench("prioritize sync batch", () => {
      prioritizeOperations(syncOperations, (operation) => operation.priority);
    }, { time: 250, warmupTime: 100 });
  });
}

function createRecord(date: PlainDate, index: number): DailyRecord {
  const parsed = parseDailyNote(pathFor(date), pathFor(date).slice(8, -3), date, NOTE_CONTENT, "en");
  return { ...parsed, words: parsed.words + index % 20 };
}

function pathFor(date: PlainDate): string {
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `Journal/${date.year}-${month}-${day}.md`;
}
