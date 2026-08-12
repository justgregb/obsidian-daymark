import { toIsoDate } from "./date";
import type { DailyRecord, PlainDate, TaggedTaskSource } from "./types";

const TASK_PATTERN = /^\s*[-+*]\s+\[([xX ])\]\s+(.*)$/u;
const LIST_PATTERN = /^\s*(?:[-+*]|\d+[.)])\s+/u;
const TALLY_NUMBER_PATTERN = /(?:^|[\s([])(\d+(?:\.\d+)?)(?=$|[\s)\].;:!?…–—]|,(?!\d))/u;
const TAG_PATTERN = /(?:^|\s)#([\p{L}\p{N}_/-]+)/gu;

interface ParsedTask {
  text: string;
  value: number | null;
  tags: string[];
}

interface MarkdownContentLine {
  text: string;
  line: number;
}

function frontmatterEnd(lines: string[]): number {
  if (lines[0]?.trim() !== "---") return -1;
  for (let index = 1; index < lines.length; index += 1) {
    const value = lines[index]?.trim();
    if (value === "---" || value === "...") return index;
  }
  return -1;
}

function stripInlineCode(value: string): string {
  return value.replace(/(`+)([\s\S]*?)\1/gu, " ");
}

function markdownContentLines(content: string): MarkdownContentLine[] {
  const lines = content.split(/\r?\n/u);
  const yamlEnd = frontmatterEnd(lines);
  const contentLines: MarkdownContentLine[] = [];
  let fence: { marker: string; length: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (yamlEnd >= 0 && index <= yamlEnd) continue;

    const fenceMatch = /^\s*(`{3,}|~{3,})/u.exec(line);
    if (fenceMatch) {
      const token = fenceMatch[1] ?? "";
      if (!fence) {
        fence = { marker: token[0] ?? "`", length: token.length };
      } else if (token[0] === fence.marker && token.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (!fence) contentLines.push({ text: line, line: index });
  }

  return contentLines;
}

function parseCompletedTask(line: string): ParsedTask | null {
  const match = TASK_PATTERN.exec(line);
  if (!match || (match[1] !== "x" && match[1] !== "X")) return null;

  const text = match[2]?.trim() ?? "";
  const searchable = stripInlineCode(text);
  const numberMatch = TALLY_NUMBER_PATTERN.exec(searchable);
  const textWithoutTags = searchable.replace(TAG_PATTERN, " ");
  const value = numberMatch ? Number(numberMatch[1]) : /\d/u.test(textWithoutTags) ? null : 1;
  const tags = new Set<string>();
  for (const tagMatch of searchable.matchAll(TAG_PATTERN)) {
    const tag = tagMatch[1]?.toLocaleLowerCase();
    if (tag) tags.add(tag);
  }
  return {
    text,
    value: value !== null && Number.isFinite(value) ? value : null,
    tags: [...tags]
  };
}

function markdownToVisibleProse(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/!\[\[[^\]]+\]\]/gu, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?\|([^\]]+)\]\]/gu, "$2")
    .replace(/\[\[([^\]#]+)(?:#[^\]]+)?\]\]/gu, "$1")
    .replace(/(`+)([\s\S]*?)\1/gu, " ")
    .replace(/<https?:\/\/[^>]+>/giu, " ")
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/(?:^|\s)#[\p{L}\p{N}_/-]+/gu, " ")
    .replace(/\[\^[^\]]+\]/gu, " ")
    .replace(/&[a-zA-Z0-9#]+;/gu, " ")
    .replace(/[*_~>#|=]+/gu, " ");
}

export function countWords(value: string, locale?: string): number {
  const text = markdownToVisibleProse(value);
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
    let count = 0;
    for (const segment of segmenter.segment(text)) {
      if (segment.isWordLike) count += 1;
    }
    return count;
  }
  return text.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’-]*/gu)?.length ?? 0;
}

export function countMarkdownProseWords(content: string, locale?: string): number {
  const prose = markdownContentLines(content)
    .filter(({ text }) => !LIST_PATTERN.test(text))
    .map(({ text }) => text)
    .join("\n");
  return countWords(prose, locale);
}

export function parseDailyNote(
  path: string,
  basename: string,
  date: PlainDate,
  content: string,
  locale?: string
): DailyRecord {
  const proseLines: string[] = [];
  const taggedTasks: TaggedTaskSource[] = [];
  let totalCheckboxes = 0;
  let completedCheckboxes = 0;

  for (const { text: line, line: index } of markdownContentLines(content)) {

    if (TASK_PATTERN.test(line)) totalCheckboxes += 1;
    const task = parseCompletedTask(line);
    if (task) {
      completedCheckboxes += 1;
      if (task.value !== null) {
        for (const tag of task.tags) {
          taggedTasks.push({ tag, value: task.value, text: task.text, line: index });
        }
      }
    }

    if (LIST_PATTERN.test(line)) continue;
    proseLines.push(line);
  }

  return {
    path,
    basename,
    date,
    isoDate: toIsoDate(date),
    words: countWords(proseLines.join("\n"), locale),
    totalCheckboxes,
    completedCheckboxes,
    taggedTasks
  };
}
