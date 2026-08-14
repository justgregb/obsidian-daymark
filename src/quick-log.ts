function localTime(now: Date): string {
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function createQuickLogEntry(text: string, now = new Date()): string {
  const compact = text.trim().replace(/\s+/gu, " ");
  if (compact.length === 0) throw new Error("A Quick Log entry cannot be empty.");
  return `\`${localTime(now)}\` — ${compact}`;
}

export function appendQuickLogEntry(content: string, entry: string): string {
  if (content.length === 0) return `${entry}\n`;
  const separator = content.endsWith("\n\n") ? "" : content.endsWith("\n") ? "\n" : "\n\n";
  return `${content}${separator}${entry}\n`;
}
