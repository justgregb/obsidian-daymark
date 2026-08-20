import { normalizePath } from "obsidian";
import { toIsoDate } from "./date";
import { daymarkMoment } from "./obsidian-moment";
import type { PlainDate } from "./types";

function dateMoment(date: PlainDate) {
  return daymarkMoment([date.year, date.month - 1, date.day]);
}

export function dailyNotePath(folder: string, format: string, date: PlainDate): string {
  const rendered = dateMoment(date).format(format).replace(/\.md$/iu, "");
  return normalizePath([folder.trim().replace(/^\/+|\/+$/gu, ""), `${rendered}.md`].filter(Boolean).join("/"));
}

export function renderDailyNoteTemplate(
  template: string,
  date: PlainDate,
  filenameFormat: string,
  now = new Date()
): string {
  const selected = dateMoment(date);
  const current = daymarkMoment(now);
  const title = selected.format(filenameFormat).split("/").pop() ?? toIsoDate(date);
  return template
    .replace(/\{\{date(?::([^}]+))?\}\}/gu, (_match, format: string | undefined) => selected.format(format ?? "YYYY-MM-DD"))
    .replace(/\{\{time(?::([^}]+))?\}\}/gu, (_match, format: string | undefined) => current.format(format ?? "HH:mm"))
    .replace(/\{\{title\}\}/gu, title);
}
