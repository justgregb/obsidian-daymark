export async function forEachConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<void>,
  yieldAfterEach = false
): Promise<void> {
  if (items.length === 0) return;

  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await task(items[index], index);
      if (yieldAfterEach) await yieldToEventLoop();
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

async function yieldToEventLoop(): Promise<void> {
  if (typeof window === "undefined") {
    await Promise.resolve();
    return;
  }
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}
