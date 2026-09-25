import type { App, TFile } from "obsidian";
import { forEachConcurrent } from "./async-pool";
import { PathOperationRevisions } from "./sync-scheduler";
import { countMarkdownProseWords } from "./parser";
import { markdownFilesInFolder } from "./vault-files";

const INDEX_READ_CONCURRENCY = 8;

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
  private readonly reads = new PathOperationRevisions();
  private scanChanges: Map<string, number | null> | null = null;
  private wordTotal = 0;
  private ready = false;
  private disposed = false;
  private revision = 0;
  private rebuilding: Promise<void> | null = null;
  private rebuildRequested = false;

  constructor(
    private readonly app: App,
    private readonly getFolder: () => string,
    private readonly getLocale: () => string
  ) {}

  get totalWords(): number {
    return this.wordTotal;
  }

  get isReady(): boolean {
    return this.ready;
  }

  reset(): void {
    this.revision += 1;
    this.reads.clear();
    this.scanChanges = null;
    this.records.clear();
    this.wordTotal = 0;
    this.ready = false;
  }

  dispose(): void {
    this.disposed = true;
    this.rebuildRequested = false;
    this.reset();
  }

  async ensureReady(): Promise<void> {
    while (!this.ready && !this.disposed) {
      if (this.rebuilding) await this.rebuilding;
      else await this.rebuild();
    }
  }

  async rebuild(): Promise<void> {
    if (this.disposed) return;
    if (this.rebuilding) {
      this.rebuildRequested = true;
      return this.rebuilding;
    }
    this.rebuilding = this.runRebuilds();
    try {
      await this.rebuilding;
    } finally {
      this.rebuilding = null;
    }
  }

  async refresh(file: TFile): Promise<void> {
    if (this.disposed) return;
    if (!this.matches(file)) {
      this.remove(file.path);
      return;
    }
    const revision = this.revision, path = file.path, folder = this.getFolder(), locale = this.getLocale();
    const operation = { path, sequence: this.reads.issue(path) };
    try {
      const content = await this.app.vault.cachedRead(file);
      if (this.disposed || !this.reads.isCurrent(operation) || revision !== this.revision || folder !== this.getFolder() || path !== file.path) return;
      const words = countMarkdownProseWords(content, locale);
      this.scanChanges?.set(path, words);
      this.setWords(path, words);
    } finally { this.reads.complete(operation); }
  }

  remove(path: string): void {
    this.reads.invalidate(path);
    this.scanChanges?.set(path, null);
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

  private async runRebuilds(): Promise<void> {
    do {
      this.rebuildRequested = false;
      await this.performRebuild();
    } while (this.rebuildRequested && !this.disposed);
  }

  private async performRebuild(): Promise<void> {
    const revision = this.revision;
    const folder = this.getFolder();
    const locale = this.getLocale();
    if (folder.length === 0) {
      this.records.clear();
      this.wordTotal = 0;
      this.ready = true;
      return;
    }
    const files = markdownFilesInFolder(this.app.vault, folder)
      .filter((file) => pathIsInAdditionalWordFolder(file.path, folder))
      .map(file => ({ file, path: file.path }));
    const parsed = new Array<readonly [string, number] | null>(files.length);
    const current = (): boolean => !this.disposed && revision === this.revision && folder === this.getFolder();
    const changes = this.scanChanges = new Map<string, number | null>();
    try {
      await forEachConcurrent(files, INDEX_READ_CONCURRENCY, async ({ file, path }, index) => {
        if (file.path !== path) { parsed[index] = null; return; }
        const content = await this.app.vault.cachedRead(file);
        if (current()) parsed[index] = file.path === path ? [path, countMarkdownProseWords(content, locale)] : null;
      }, true, current);
    } finally { if (this.scanChanges === changes) this.scanChanges = null; }
    if (this.disposed || revision !== this.revision) return;
    if (folder !== this.getFolder()) { this.rebuildRequested = true; return; }
    this.records.clear();
    this.wordTotal = 0;
    parsed.forEach((entry, index) => {
      if (entry && files[index].file.path === files[index].path) this.setWords(entry[0], entry[1]);
    });
    for (const [path, words] of changes) {
      if (words === null) this.remove(path); else this.setWords(path, words);
    }
    this.ready = true;
  }

  private setWords(path: string, words: number): void {
    const previous = this.records.get(path) ?? 0;
    this.records.set(path, words);
    this.wordTotal += words - previous;
  }
}
