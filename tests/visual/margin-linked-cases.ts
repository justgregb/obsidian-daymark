import { toIsoDate } from "../../src/date";
import type { DailyRecord, PlainDate } from "../../src/types";

// Fictional dates and titles exercise the shared layout without vault data.
export const linkedCaseMonth = { year: 2024, month: 6, day: 1 };
export const linkedCaseToday = "2024-06-07";
export const linkedCaseNames: Record<string, string> = {
  "2024-06-01": "Reading",
  "2024-06-02": "🌿 Garden notes",
  "2024-06-03": "A long day name that must stay within the sidebar",
  "2024-06-05": "👩🏽‍🚀",
  "2024-06-06": "No linked notes"
};

export function linkedCaseRecord(date: PlainDate): DailyRecord | null {
  if (date.year !== 2024 || date.month !== 6 || date.day > 8) return null;
  const iso = toIsoDate(date);
  const titles = date.day === 6 || date.day === 8 ? [] : date.day === 3
    ? ["A long linked title that must truncate without widening the row", "Field journal", "Reading list"]
    : ["Field journal"];
  return {
    date, isoDate: iso, path: `Journal/${iso}.md`, basename: iso,
    words: 25, photos: 0, totalCheckboxes: 0, completedCheckboxes: 0, taggedValues: [],
    linkedNotes: titles.map(title => ({ path: `Notes/${title}.md`, title }))
  };
}

/** Browser geometry assertions run against the production renderer and CSS. */
export function checkLinkedCaseLayout(root: HTMLElement, compactTouch: boolean): string[] {
  const failures: string[] = [];
  const rows = Array.from(root.querySelectorAll<HTMLElement>(".daymark-margin-day[data-date^='2024-06-']"))
    .filter(row => Number(row.dataset.date?.slice(-2)) <= 8);
  const baseline = root.querySelector("[data-date='2024-06-06']")?.getBoundingClientRect().height;
  if (rows.length !== 8 || !baseline) return ["Expected all eight linked-layout cases"];
  for (const row of rows) {
    const bounds = row.getBoundingClientRect();
    const date = row.dataset.date;
    if (row.scrollWidth > row.clientWidth + 1) failures.push(`${date}: horizontal overflow`);
    if (compactTouch && Math.abs(bounds.height - baseline) > 1) failures.push(`${date}: exceeds ordinary row height`);
    const name = row.querySelector(".daymark-margin-name")?.getBoundingClientRect();
    const link = row.querySelector(".daymark-margin-linked-first")?.getBoundingClientRect();
    if (name && link && name.bottom > link.top + 1) failures.push(`${date}: name overlaps linked title`);
    for (const selector of [".daymark-margin-name", ".daymark-margin-linked-first", ".daymark-margin-linked-more"]) {
      const control = row.querySelector<HTMLElement>(selector);
      if (!control || !control.getClientRects().length) continue;
      const rect = control.getBoundingClientRect();
      if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1) {
        failures.push(`${date}: ${selector} escapes row`);
      }
      if (rect.height + 1 < parseFloat(getComputedStyle(control).lineHeight)) failures.push(`${date}: clipped text`);
    }
  }
  return failures;
}
