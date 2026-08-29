import { describe, expect, it } from "vitest";
import { forEachConcurrent } from "../src/async-pool";

describe("bounded async work", () => {
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
