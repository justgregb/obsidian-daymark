import { TFile, type App } from "obsidian";
import { forEachConcurrent } from "./async-pool";
import type { DailyRecord, LinkedNote } from "./types";
import { countMarkdownProseWords } from "./parser";

interface WordEntry {
  words: number;
  ready: boolean;
  failed?: boolean;
  pending?: Promise<void>;
}

/** Direct local links only: no recursive traversal or changes to Tally totals. */
export class LinkedWritingIndex {
  private readonly targets = new Map<string, Set<string>>();
  private readonly sources = new Map<string, Set<string>>();
  private readonly words = new Map<string, WordEntry>();
  private readonly noteLinks = new Map<string, { locale: string; notes: readonly LinkedNote[] }>();
  private disposed = false;
  private generation = 0;

  constructor(private readonly app: App, private readonly getLocale: () => string,
    private readonly knownWords: (path: string) => number | undefined = () => undefined) {}

  reset(): void {
    this.generation++;
    this.targets.clear();
    this.sources.clear();
    this.words.clear();
    this.noteLinks.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.reset();
  }

  sourcesFor(path: string): readonly string[] {
    return [...this.sources.get(path) ?? []];
  }

  notesFor(path: string): readonly LinkedNote[] { return this.noteLinks.get(path)?.notes ?? []; }

  summary(path: string): Pick<DailyRecord, "linkedWords" | "linkedNoteCount" | "linkedWritingStatus"> {
    let linkedWords = 0;
    let linkedNoteCount = 0;
    let loading = false;
    let unavailable = false;
    for (const target of this.targets.get(path) ?? []) {
      const entry = this.words.get(target);
      if (!entry?.ready) {
        if (entry?.failed) unavailable = true;
        else if (entry) loading = true;
        continue;
      }
      linkedWords += entry.words;
      linkedNoteCount += 1;
    }
    return { linkedWords, linkedNoteCount, ...(loading ? { linkedWritingStatus: "loading" as const } : unavailable ? { linkedWritingStatus: "unavailable" as const } : {}) };
  }

  async rebuild(files: readonly TFile[], knownWords?: ReadonlyMap<string, number>, progress?: (sources: readonly string[]) => void): Promise<void> {
    if (this.disposed) return;
    this.reset();
    const targets = new Map<string, TFile>();
    for (const file of files) {
      for (const target of this.setLinks(file)) targets.set(target.path, target);
    }
    await this.readTargets([...targets.values()], knownWords, progress);
  }

  async refreshSource(file: TFile): Promise<boolean> {
    if (this.disposed) return false;
    const before = this.summary(file.path);
    const beforeNotes = this.noteLinks.get(file.path);
    await this.readTargets(this.setLinks(file));
    const after = this.summary(file.path);
    return before.linkedWords !== after.linkedWords || before.linkedNoteCount !== after.linkedNoteCount
      || before.linkedWritingStatus !== after.linkedWritingStatus || beforeNotes !== this.noteLinks.get(file.path);
  }

  async refreshTarget(file: TFile, knownWords?: number): Promise<void> {
    if (this.disposed || !this.sources.has(file.path)) return;
    this.words.delete(file.path);
    await this.read(file, knownWords);
  }

  remove(path: string): void {
    for (const source of this.sources.get(path) ?? []) {
      this.targets.get(source)?.delete(path);
      const links = this.noteLinks.get(source);
      if (links) this.noteLinks.set(source, { ...links, notes: links.notes.filter(note => note.path !== path) });
    }
    this.sources.delete(path);
    this.removeSource(path);
    this.words.delete(path);
  }

  removeSource(path: string, retained = new Set<string>()): void {
    for (const target of this.targets.get(path) ?? []) {
      if (retained.has(target)) continue;
      const sources = this.sources.get(target);
      sources?.delete(path);
      if (sources?.size === 0) {
        this.sources.delete(target);
        this.words.delete(target);
      }
    }
    this.targets.delete(path);
    this.noteLinks.delete(path);
  }

  private setLinks(file: TFile): TFile[] {
    const previous = this.noteLinks.get(file.path);
    const locale = this.getLocale();
    const resolved = new Map<string, TFile>();
    for (const path of Object.keys(this.app.metadataCache.resolvedLinks[file.path] ?? {})) {
      if (path === file.path) continue;
      const target = this.app.vault.getAbstractFileByPath(path);
      if (target instanceof TFile && target.extension.toLowerCase() === "md") resolved.set(target.path, target);
    }
    const files = [...resolved.values()];
    // Metadata notifications often repeat unchanged links. Retain their sorted
    // titles and reverse dependencies instead of tearing down and rebuilding them.
    if (previous?.locale === locale && previous.notes.length === files.length
      && previous.notes.every(note => resolved.get(note.path)?.basename === note.title)) return files;
    files.sort((a, b) => a.basename.localeCompare(b.basename, locale) || a.path.localeCompare(b.path));
    const notes = files.map(target => ({ path: target.path, title: target.basename }));
    const paths = new Set(files.map((target) => target.path));
    this.removeSource(file.path, paths);
    this.targets.set(file.path, paths);
    this.noteLinks.set(file.path, { locale, notes });
    for (const path of paths) {
      let sources = this.sources.get(path);
      if (!sources) this.sources.set(path, sources = new Set());
      sources.add(file.path);
    }
    return files;
  }

  private async read(file: TFile, knownWords?: number): Promise<void> {
    if (this.disposed || !this.sources.has(file.path)) return;
    const existing = this.words.get(file.path);
    if (existing?.ready || existing?.pending) return existing.pending;
    const entry: WordEntry = { words: knownWords ?? 0, ready: knownWords !== undefined };
    this.words.set(file.path, entry);
    if (entry.ready) return;
    entry.pending = this.app.vault.cachedRead(file).then((content) => {
      // Edits, removals and unload can supersede a read while it is in flight.
      if (this.words.get(file.path) !== entry || this.disposed) return;
      entry.words = countMarkdownProseWords(content, this.getLocale());
      entry.ready = true;
    }).catch((error: unknown) => {
      if (this.words.get(file.path) !== entry || this.disposed) return;
      entry.failed = true;
      console.warn(`Daymark could not count linked writing in ${file.path}.`, error);
    });
    await entry.pending;
    delete entry.pending;
  }

  private readTargets(files: readonly TFile[], knownWords?: ReadonlyMap<string, number>, progress?: (sources: readonly string[]) => void): Promise<void> {
    const generation = this.generation;
    // Already-indexed daily notes need neither a second read nor an event-loop yield.
    const pending = files.filter(file => {
      if (this.words.get(file.path)?.ready) return false;
      const words = knownWords?.get(file.path) ?? this.knownWords(file.path);
      if (words === undefined) {
        // Queued targets are pending too, even before a worker starts their read.
        if (!this.words.has(file.path)) this.words.set(file.path, { words: 0, ready: false });
        return true;
      }
      this.words.set(file.path, { words, ready: true });
      return false;
    });
    return forEachConcurrent(pending, 8, async file => {
      if (generation !== this.generation || this.disposed) return;
      await this.read(file);
      if (generation === this.generation && !this.disposed) progress?.(this.sourcesFor(file.path));
    }, true, () => generation === this.generation && !this.disposed);
  }
}
