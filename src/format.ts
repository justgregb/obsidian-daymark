export function formatTagLabel(tag: string, locale?: string): string {
  const label = tag.replace(/[-_/]+/gu, " ").replace(/\s+/gu, " ").trim();
  const characters = Array.from(label);
  const first = characters.shift();
  if (!first) return tag;
  return `${first.toLocaleUpperCase(locale)}${characters.join("")}`;
}
