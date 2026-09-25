export async function forEachConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<void>,
  yieldAfterEach = false,
  shouldContinue?: () => boolean
): Promise<void> {
  if (items.length === 0) return;

  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
  let nextIndex = 0;
  let failed = false;

  async function worker(): Promise<void> {
    while (!failed && nextIndex < items.length && shouldContinue?.() !== false) {
      const index = nextIndex;
      nextIndex += 1;
      try { await task(items[index], index); }
      catch (error) { failed = true; throw error; }
      if (!failed && yieldAfterEach && nextIndex < items.length && shouldContinue?.() !== false) await yieldToEventLoop();
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
