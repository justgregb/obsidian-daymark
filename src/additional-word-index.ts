import type { App, TFile } from "obsidian";
import { countMarkdownProseWords } from "./parser";

function normalizeFolder(value: string): string {
  return value.trim().replace(/\\/gu, "/").replace(/\/{2,}/gu, "/").replace(/^\/+|\/+$/gu, "");
}

export function pathIsInAdditionalWordFolder(path: string, folder: string): boolean {
  const normalizedFolder = normalizeFolder(folder);
  const normalizedPath = path.replace(/\\/gu, "/").replace(/\/{2,}/gu, "/").replace(/^\/+|\/+$/gu, "");
  if (normalizedFolder.length === 0 || !normalizedPath.toLocaleLowerCase().endsWith(".md")) return false;
  if (!normalizedPath.startsWith(`${normalizedFolder}/`)) return false;
  const filename = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
  return !filename.startsWith("Tally — ");
}

export function additionalWordFolderLabel(folder: string): string {
  const normalized = normalizeFolder(folder);
  return normalized.slice(normalized.lastIndexOf("/") + 1) || normalized;
}

export class AdditionalWordIndex {
  private readonly records = new Map<string, number>();
  private wordTotal = 0;
  private ready = false;
  private rebuilding: Promise<void> | null = null;

  constructor(
    private readonly app: App,
    private readonly getFolder: () => string,
    private readonly getLocale: () => string
  ) {}

  get totalWords(): number {
    return this.wordTotal;
  }

  async ensureReady(): Promise<void> {
    if (!this.ready) await this.rebuild();
  }

  async rebuild(): Promise<void> {
    if (this.rebuilding) return this.rebuilding;
    this.rebuilding = this.performRebuild();
    try {
      await this.rebuilding;
    } finally {
      this.rebuilding = null;
    }
  }

  async refresh(file: TFile): Promise<void> {
    if (!this.matches(file)) {
      this.remove(file.path);
      return;
    }
    const content = await this.app.vault.cachedRead(file);
    this.setWords(file.path, countMarkdownProseWords(content, this.getLocale()));
  }

  remove(path: string): void {
    const previous = this.records.get(path);
    if (previous === undefined) return;
    this.records.delete(path);
    this.wordTotal -= previous;
  }

  has(path: string): boolean {
    return this.records.has(path);
  }

  matches(file: TFile): boolean {
    return pathIsInAdditionalWordFolder(file.path, this.getFolder());
  }

  private async performRebuild(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles().filter((file) => this.matches(file));
    const parsed = await Promise.all(files.map(async (file) => {
      const content = await this.app.vault.cachedRead(file);
      return [file.path, countMarkdownProseWords(content, this.getLocale())] as const;
    }));
    this.records.clear();
    this.wordTotal = 0;
    for (const [path, words] of parsed) this.setWords(path, words);
    this.ready = true;
  }

  private setWords(path: string, words: number): void {
    const previous = this.records.get(path) ?? 0;
    this.records.set(path, words);
    this.wordTotal += words - previous;
  }
}
