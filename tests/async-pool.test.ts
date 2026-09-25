import { describe, expect, it } from "vitest";
import { forEachConcurrent } from "../src/async-pool";

describe("bounded async work", () => {
  it("stops other workers claiming more work after a failure", async () => {
    const visited: number[] = [];
    let release!: () => void;
    const work = forEachConcurrent([0, 1, 2, 3], 2, async item => {
      visited.push(item);
      if (item === 0) throw new Error("Read failed");
      await new Promise<void>(resolve => { release = resolve; });
    });
    await expect(work).rejects.toThrow("Read failed");
    release(); await Promise.resolve(); await Promise.resolve();
    expect(visited).toEqual([0, 1]);
  });
  it("stops claiming queued work when its owner is cancelled", async () => {
    let current = true;
    const visited: number[] = [];
    const release: Array<() => void> = [];
    const work = forEachConcurrent([0, 1, 2, 3, 4, 5], 2, async item => {
      visited.push(item);
      await new Promise<void>(resolve => release.push(resolve));
    }, true, () => current);
    expect(visited).toEqual([0, 1]);
    current = false;
    release.forEach(resolve => resolve());
    await work;
    expect(visited).toEqual([0, 1]);
  });
  it("never exceeds the requested concurrency and visits every item", async () => {
    let active = 0;
    let maximumActive = 0;
    const visited: number[] = [];

    await forEachConcurrent([0, 1, 2, 3, 4, 5], 2, async (item) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      visited.push(item);
      active -= 1;
    });

    expect(maximumActive).toBe(2);
    expect(visited.sort((left, right) => left - right)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("treats invalid low concurrency as one worker", async () => {
    const visited: number[] = [];
    await forEachConcurrent([1, 2, 3], 0, async (item) => {
      visited.push(item);
    });
    expect(visited).toEqual([1, 2, 3]);
  });
});
