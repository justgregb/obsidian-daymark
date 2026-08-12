import { parseDateFromBasename } from "./date";
import type { PlainDate } from "./types";

export type DatePathParser = (value: string, format: string) => PlainDate | null;

function normalizeVaultPath(value: string): string {
  return value.trim().replace(/\\/gu, "/").replace(/\/{2,}/gu, "/").replace(/^\/+|\/+$/gu, "");
}

export function pathIsWithinFolder(path: string, folder: string): boolean {
  const normalizedPath = normalizeVaultPath(path);
  const normalizedFolder = normalizeVaultPath(folder);
  if (normalizedFolder.length === 0) return true;
  return normalizedPath.startsWith(`${normalizedFolder}/`);
}

export function dateFromDailyNotePath(
  path: string,
  folder: string,
  format: string,
  parseDate: DatePathParser = parseDateFromBasename
): PlainDate | null {
  const normalizedPath = normalizeVaultPath(path);
  const normalizedFolder = normalizeVaultPath(folder);
  if (!pathIsWithinFolder(normalizedPath, normalizedFolder) || !normalizedPath.endsWith(".md")) return null;
  const relativePath = normalizedFolder.length === 0
    ? normalizedPath.slice(0, -3)
    : normalizedPath.slice(normalizedFolder.length + 1, -3);
  const candidate = format.includes("/")
    ? relativePath
    : relativePath.slice(relativePath.lastIndexOf("/") + 1);
  return parseDate(candidate, format);
}
