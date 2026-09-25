import { addDays, parseIsoDate, toIsoDate } from "./date";

export interface MarginFold { start: string; end: string; dates: string[] }

/** Fold only complete runs inside a month; never join across missing window rows. */
export function marginFolds(dates: Iterable<string>, eligible: (iso: string) => boolean): MarginFold[] {
  const folds: MarginFold[] = [];
  let run: string[] = [];
  const finish = (): void => {
    if (run.length >= 3) folds.push({ start: run[0], end: run[run.length - 1], dates: run });
    run = [];
  };
  for (const iso of dates) {
    const previous = run[run.length - 1];
    if (previous && (previous.slice(0, 7) !== iso.slice(0, 7)
      || toIsoDate(addDays(parseIsoDate(previous)!, 1)) !== iso)) finish();
    if (eligible(iso)) run.push(iso); else finish();
  }
  finish();
  return folds;
}
