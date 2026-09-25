import { describe, expect, it } from "vitest";
import {
  applyCoverThumbnail,
  CoverThumbnailCache,
  coverThumbnailFingerprint,
  resolveCoverThumbnail,
  squareCoverCrop,
  type CoverThumbnailSource
} from "../src/cover-thumbnail-cache";

const first: CoverThumbnailSource = {
  path: "Attachments/first.jpg",
  mtime: 100,
  size: 4_000
};

function immediateOptions(
  generate: (source: CoverThumbnailSource) => Promise<string | null>,
  revoked: string[] = []
) {
  return {
    generate,
    revokeUrl: (url: string) => revoked.push(url),
    yieldControl: async () => {}
  };
}

describe("cover thumbnail cache", () => {
  it("bounds path bookkeeping across cache misses, eviction, and failed images", async () => {
    const cache = new CoverThumbnailCache({ ...immediateOptions(async source => source.size ? `blob:${source.path}` : null), maxEntries: 4 });
    const paths = (cache as unknown as { latestFingerprintByPath: Map<string, string> }).latestFingerprintByPath;
    for (let index = 0; index < 200; index++) {
      const source = { ...first, path: `Photos/${index}.jpg` };
      cache.get(source);
      await cache.request(source);
      await cache.request({ ...source, path: `Photos/failed-${index}.jpg`, size: 0 });
      expect(paths.size).toBeLessThanOrEqual(4);
    }
    expect(cache.get({ ...first, path: "Photos/199.jpg" })).toBe("blob:Photos/199.jpg");
    cache.dispose();
    expect(paths.size).toBe(0);
  });
  it("deduplicates simultaneous requests and reuses the stable cached URL", async () => {
    let generated = 0;
    const cache = new CoverThumbnailCache(immediateOptions(async () => {
      generated += 1;
      return "blob:first";
    }));

    const one = cache.request(first);
    const two = cache.request(first);

    expect(two).toBe(one);
    await expect(one).resolves.toBe("blob:first");
    expect(cache.get(first)).toBe("blob:first");
    expect(generated).toBe(1);
  });

  it("regenerates after modification-time or file-size changes", async () => {
    const revoked: string[] = [];
    let generated = 0;
    const cache = new CoverThumbnailCache(immediateOptions(async () => {
      generated += 1;
      return `blob:${generated}`;
    }, revoked));

    await expect(cache.request(first)).resolves.toBe("blob:1");
    await expect(cache.request({ ...first, mtime: 101 })).resolves.toBe("blob:2");
    await expect(cache.request({ ...first, mtime: 101, size: 4_001 })).resolves.toBe("blob:3");

    expect(generated).toBe(3);
    expect(revoked).toEqual(["blob:1", "blob:2"]);
  });

  it("evicts the least-recently-used URL exactly once", async () => {
    const revoked: string[] = [];
    const cache = new CoverThumbnailCache({
      ...immediateOptions(async (source) => `blob:${source.path}`, revoked),
      maxEntries: 2
    });
    const second = { ...first, path: "Attachments/second.jpg" };
    const third = { ...first, path: "Attachments/third.jpg" };

    await cache.request(first);
    await cache.request(second);
    expect(cache.get(first)).toBe("blob:Attachments/first.jpg");
    await cache.request(third);

    expect(revoked).toEqual(["blob:Attachments/second.jpg"]);
    expect(cache.get(second)).toBeNull();
    cache.dispose();
    expect(revoked).toEqual([
      "blob:Attachments/second.jpg",
      "blob:Attachments/first.jpg",
      "blob:Attachments/third.jpg"
    ]);
  });

  it("disposal revokes every remaining URL and makes future work inert", async () => {
    const revoked: string[] = [];
    const cache = new CoverThumbnailCache(immediateOptions(async (source) => `blob:${source.path}`, revoked));
    const second = { ...first, path: "Attachments/second.jpg" };
    await cache.request(first);
    await cache.request(second);

    cache.dispose();

    expect(revoked).toEqual(["blob:Attachments/first.jpg", "blob:Attachments/second.jpg"]);
    expect(cache.get(first)).toBeNull();
    await expect(cache.request(first)).resolves.toBeNull();
  });

  it("revokes a thumbnail that finishes after disposal", async () => {
    const revoked: string[] = [];
    let release!: () => void;
    const cache = new CoverThumbnailCache(immediateOptions(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return "blob:late";
    }, revoked));
    const pending = cache.request(first);
    await waitFor(() => release !== undefined);

    cache.dispose();
    release();

    await expect(pending).resolves.toBeNull();
    expect(revoked).toEqual(["blob:late"]);
  });

  it("serializes generation so only one source is decoded at a time", async () => {
    let active = 0;
    let maximumActive = 0;
    const releases: Array<() => void> = [];
    const cache = new CoverThumbnailCache(immediateOptions(async (source) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return `blob:${source.path}`;
    }));
    const second = { ...first, path: "Attachments/second.jpg" };

    const one = cache.request(first);
    const two = cache.request(second);
    await waitFor(() => releases.length === 1);
    expect(active).toBe(1);
    releases.shift()?.();
    await one;
    await waitFor(() => releases.length === 1);
    expect(active).toBe(1);
    releases.shift()?.();
    await two;

    expect(maximumActive).toBe(1);
  });

  it("bounds pending work and lets cancelled jobs settle quietly", async () => {
    const releases: Array<() => void> = [];
    const cache = new CoverThumbnailCache({
      ...immediateOptions(async (source) => {
        await new Promise<void>((resolve) => releases.push(resolve));
        return `blob:${source.path}`;
      }),
      maxPending: 2
    });
    const one = cache.request(first);
    await waitFor(() => releases.length === 1);
    const two = cache.request({ ...first, path: "Attachments/second.jpg" });
    const three = cache.request({ ...first, path: "Attachments/third.jpg" });
    const four = cache.request({ ...first, path: "Attachments/fourth.jpg" });

    await expect(two).resolves.toBeNull();
    releases.shift()?.();
    await one;
    await waitFor(() => releases.length === 1);
    releases.shift()?.();
    await three;
    await waitFor(() => releases.length === 1);
    releases.shift()?.();
    await four;
  });

  it("turns generation failures into a quiet empty result", async () => {
    let attempts = 0;
    const cache = new CoverThumbnailCache(immediateOptions(async () => {
      attempts += 1;
      throw new Error("unsupported image");
    }));

    await expect(cache.request(first)).resolves.toBeNull();
    await expect(cache.request(first)).resolves.toBeNull();
    expect(attempts).toBe(2);
  });

  it("does not apply stale results to detached or repurposed images", () => {
    const fingerprint = coverThumbnailFingerprint(first, 128);
    const target: {
      isConnected: boolean;
      dataset: { coverFingerprint?: string };
      src: string;
    } = {
      isConnected: false,
      dataset: { coverFingerprint: fingerprint },
      src: ""
    };

    expect(applyCoverThumbnail(target, fingerprint, "blob:first")).toBe(false);
    target.isConnected = true;
    target.dataset.coverFingerprint = "different";
    expect(applyCoverThumbnail(target, fingerprint, "blob:first")).toBe(false);
    target.dataset.coverFingerprint = fingerprint;
    expect(applyCoverThumbnail(target, fingerprint, "blob:first")).toBe(true);
    expect(target.src).toBe("blob:first");
  });

  it("performs no cache lookup or request when covers are disabled", () => {
    let lookups = 0;
    let requests = 0;
    const cache = {
      get: () => {
        lookups += 1;
        return null;
      },
      request: () => {
        requests += 1;
        return Promise.resolve("blob:first");
      }
    };

    expect(resolveCoverThumbnail(false, cache, first)).toEqual({ url: null, pending: null });
    expect(lookups).toBe(0);
    expect(requests).toBe(0);
  });

  it("calculates centered square crops without stretching", () => {
    expect(squareCoverCrop(300, 200)).toEqual({ sourceX: 50, sourceY: 0, sourceSize: 200 });
    expect(squareCoverCrop(200, 300)).toEqual({ sourceX: 0, sourceY: 50, sourceSize: 200 });
    expect(squareCoverCrop(0, 300)).toBeNull();
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error("Timed out waiting for thumbnail work.");
}
