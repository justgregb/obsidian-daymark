import { imageMimeType } from "./cover";

export const COVER_THUMBNAIL_DIMENSION = 128;
export const COVER_THUMBNAIL_CACHE_ENTRIES = 64;
export const COVER_THUMBNAIL_PENDING_LIMIT = 48;

export interface CoverThumbnailSource {
  path: string;
  mtime: number;
  size: number;
}

export interface CoverThumbnailCacheOptions {
  generate: (source: CoverThumbnailSource, dimension: number) => Promise<string | null>;
  revokeUrl?: (url: string) => void;
  yieldControl?: () => Promise<void>;
  dimension?: number;
  maxEntries?: number;
  maxPending?: number;
}

interface ThumbnailEntry {
  path: string;
  url: string;
}

interface PendingThumbnail {
  key: string;
  source: CoverThumbnailSource;
  promise: Promise<string | null>;
  resolve: (url: string | null) => void;
}

export interface CoverThumbnailResolution {
  url: string | null;
  pending: Promise<string | null> | null;
}

export interface CoverThumbnailTarget {
  readonly isConnected: boolean;
  readonly dataset: { coverFingerprint?: string };
  src: string;
}

export interface SquareCrop {
  sourceX: number;
  sourceY: number;
  sourceSize: number;
}

export function coverThumbnailFingerprint(source: CoverThumbnailSource, dimension: number): string {
  return `${source.path}\u0000${source.mtime}\u0000${source.size}\u0000${dimension}`;
}

export function squareCoverCrop(width: number, height: number): SquareCrop | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const sourceSize = Math.min(width, height);
  return {
    sourceX: (width - sourceSize) / 2,
    sourceY: (height - sourceSize) / 2,
    sourceSize
  };
}

export function applyCoverThumbnail(
  target: CoverThumbnailTarget,
  expectedFingerprint: string,
  url: string | null
): boolean {
  if (!url || !target.isConnected || target.dataset.coverFingerprint !== expectedFingerprint) return false;
  target.src = url;
  return true;
}

export function resolveCoverThumbnail(
  enabled: boolean,
  cache: Pick<CoverThumbnailCache, "get" | "request">,
  source: CoverThumbnailSource
): CoverThumbnailResolution {
  if (!enabled) return { url: null, pending: null };
  const url = cache.get(source);
  return url ? { url, pending: null } : { url: null, pending: cache.request(source) };
}

export class CoverThumbnailCache {
  readonly dimension: number;
  private readonly maxEntries: number;
  private readonly maxPending: number;
  private readonly generate: CoverThumbnailCacheOptions["generate"];
  private readonly revokeUrl: (url: string) => void;
  private readonly yieldControl: () => Promise<void>;
  private readonly entries = new Map<string, ThumbnailEntry>();
  private readonly latestFingerprintByPath = new Map<string, string>();
  private readonly inFlight = new Map<string, PendingThumbnail>();
  private queue: PendingThumbnail[] = [];
  private processing = false;
  private disposed = false;

  constructor(options: CoverThumbnailCacheOptions) {
    this.dimension = positiveInteger(options.dimension, COVER_THUMBNAIL_DIMENSION);
    this.maxEntries = positiveInteger(options.maxEntries, COVER_THUMBNAIL_CACHE_ENTRIES);
    this.maxPending = positiveInteger(options.maxPending, COVER_THUMBNAIL_PENDING_LIMIT);
    this.generate = options.generate;
    this.revokeUrl = options.revokeUrl ?? ((url) => URL.revokeObjectURL(url));
    this.yieldControl = options.yieldControl ?? yieldToBrowser;
  }

  get(source: CoverThumbnailSource): string | null {
    if (this.disposed) return null;
    const key = this.observe(source);
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.url;
  }

  request(source: CoverThumbnailSource): Promise<string | null> {
    if (this.disposed) return Promise.resolve(null);
    const cached = this.get(source);
    if (cached) return Promise.resolve(cached);
    const key = coverThumbnailFingerprint(source, this.dimension);
    const existing = this.inFlight.get(key);
    if (existing) return existing.promise;

    let resolve!: (url: string | null) => void;
    const promise = new Promise<string | null>((complete) => {
      resolve = complete;
    });
    const pending = { key, source: { ...source }, promise, resolve };
    this.inFlight.set(key, pending);
    this.queue.push(pending);
    this.trimPendingQueue();
    this.startProcessing();
    return promise;
  }

  invalidatePath(path: string): void {
    this.latestFingerprintByPath.delete(path);
    for (const [key, entry] of this.entries) {
      if (entry.path === path) this.removeEntry(key, entry);
    }
    this.cancelQueued((pending) => pending.source.path === path);
  }

  cancelPending(): void {
    this.cancelQueued(() => true);
  }

  clear(): void {
    this.latestFingerprintByPath.clear();
    this.cancelPending();
    for (const [key, entry] of this.entries) this.removeEntry(key, entry);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
  }

  private observe(source: CoverThumbnailSource): string {
    const key = coverThumbnailFingerprint(source, this.dimension);
    if (this.latestFingerprintByPath.get(source.path) === key) return key;
    this.latestFingerprintByPath.set(source.path, key);
    for (const [entryKey, entry] of this.entries) {
      if (entry.path === source.path && entryKey !== key) this.removeEntry(entryKey, entry);
    }
    this.cancelQueued((pending) => pending.source.path === source.path && pending.key !== key);
    return key;
  }

  private startProcessing(): void {
    if (this.processing || this.disposed) return;
    this.processing = true;
    void this.processQueue();
  }

  private async processQueue(): Promise<void> {
    try {
      while (!this.disposed) {
        const pending = this.queue.shift();
        if (!pending) break;
        let url: string | null = null;
        try {
          await this.yieldControl();
          if (!this.disposed) url = await this.generate(pending.source, this.dimension);
        } catch {
          url = null;
        }

        const current = this.inFlight.get(pending.key);
        if (current !== pending) {
          if (url) this.safeRevoke(url);
          continue;
        }
        this.inFlight.delete(pending.key);
        if (!url || this.disposed
          || this.latestFingerprintByPath.get(pending.source.path) !== pending.key) {
          if (url) this.safeRevoke(url);
          pending.resolve(null);
          continue;
        }

        this.entries.set(pending.key, { path: pending.source.path, url });
        this.evictOverflow();
        pending.resolve(url);
      }
    } finally {
      this.processing = false;
      if (!this.disposed && this.queue.length > 0) this.startProcessing();
    }
  }

  private trimPendingQueue(): void {
    while (this.queue.length > this.maxPending) {
      const oldest = this.queue.shift();
      if (oldest) this.cancelQueuedEntry(oldest);
    }
  }

  private cancelQueued(matches: (pending: PendingThumbnail) => boolean): void {
    const retained: PendingThumbnail[] = [];
    for (const pending of this.queue) {
      if (matches(pending)) this.cancelQueuedEntry(pending);
      else retained.push(pending);
    }
    this.queue = retained;
  }

  private cancelQueuedEntry(pending: PendingThumbnail): void {
    if (this.inFlight.get(pending.key) !== pending) return;
    this.inFlight.delete(pending.key);
    if (this.latestFingerprintByPath.get(pending.source.path) === pending.key) {
      this.latestFingerprintByPath.delete(pending.source.path);
    }
    pending.resolve(null);
  }

  private evictOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) return;
      const oldest = this.entries.get(oldestKey);
      if (oldest) this.removeEntry(oldestKey, oldest);
    }
  }

  private removeEntry(key: string, entry: ThumbnailEntry): void {
    if (!this.entries.delete(key)) return;
    this.safeRevoke(entry.url);
  }

  private safeRevoke(url: string): void {
    try {
      this.revokeUrl(url);
    } catch {
      // Releasing a stale object URL is best-effort cleanup.
    }
  }
}

export async function generateCoverThumbnailUrl(
  bytes: ArrayBuffer,
  path: string,
  dimension = COVER_THUMBNAIL_DIMENSION
): Promise<string | null> {
  const blob = new Blob([bytes], { type: imageMimeType(path) });
  const decoded = await decodeCoverImage(blob);
  const crop = squareCoverCrop(decoded.width, decoded.height);
  if (!crop) {
    decoded.dispose();
    return null;
  }

  const canvas = createEl("canvas");
  canvas.width = dimension;
  canvas.height = dimension;
  let decodedDisposed = false;
  try {
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      decoded.source,
      crop.sourceX,
      crop.sourceY,
      crop.sourceSize,
      crop.sourceSize,
      0,
      0,
      dimension,
      dimension
    );
    decoded.dispose();
    decodedDisposed = true;
    const thumbnail = await canvasToBlob(canvas, "image/webp", 0.82)
      ?? await canvasToBlob(canvas, "image/png");
    return thumbnail ? URL.createObjectURL(thumbnail) : null;
  } finally {
    if (!decodedDisposed) decoded.dispose();
    canvas.width = 1;
    canvas.height = 1;
  }
}

interface DecodedCoverImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}

async function decodeCoverImage(blob: Blob): Promise<DecodedCoverImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close()
      };
    } catch {
      // Some mobile WebViews support the format only through an image element.
    }
  }

  const sourceUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  try {
    await loadImage(image, sourceUrl);
  } catch (error) {
    URL.revokeObjectURL(sourceUrl);
    throw error;
  }
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    dispose: () => {
      image.removeAttribute("src");
      URL.revokeObjectURL(sourceUrl);
    }
  };
}

function loadImage(image: HTMLImageElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", failed);
    };
    const loaded = (): void => {
      cleanup();
      resolve();
    };
    const failed = (): void => {
      cleanup();
      reject(new Error("Image format could not be decoded."));
    };
    image.addEventListener("load", loaded);
    image.addEventListener("error", failed);
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
