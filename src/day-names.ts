import { parseIsoDate } from "./date";

// Consume a complete leading emoji, including keycaps, flags, modifiers and ZWJ
// sequences. Text-presentation symbols (©, ™, etc.) need their emoji selector.
const leadingEmoji = /^(?:[0-9#*]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|(?!\p{Emoji_Modifier}|\p{Regional_Indicator})(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F)\uFE0F?\p{Emoji_Modifier}?(?:[\u{E0020}-\u{E007E}]+\u{E007F})?(?:\u200D\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?)*)(?![\uFE0E\u200D\p{Emoji_Modifier}\u{E0020}-\u{E007F}])/u;

/** Presentation only: preserve the full saved name and editor value. */
export function splitDayName(name: string): { emoji: string; text: string } {
  const emoji = name.match(leadingEmoji)?.[0] ?? "";
  return { emoji, text: emoji ? name.slice(emoji.length).trimStart() : name };
}

export function normalizeDayName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

export function normalizeDayNames(value: unknown): Record<string, string> {
  const names: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return names;
  for (const [iso, label] of Object.entries(value)) {
    const name = normalizeDayName(label);
    if (parseIsoDate(iso) && name) names[iso] = name;
  }
  return names;
}

export function withDayName(names: Record<string, string>, iso: string, value: string): Record<string, string> {
  if (!parseIsoDate(iso)) throw new Error("Invalid day name date");
  const next = { ...names };
  const name = normalizeDayName(value);
  if (name) next[iso] = name;
  else delete next[iso];
  return next;
}

export function dayNamesAreEqual(left: Record<string, string>, right: Record<string, string>): boolean {
  return Object.keys(left).length === Object.keys(right).length
    && Object.entries(left).every(([iso, name]) => right[iso] === name);
}
