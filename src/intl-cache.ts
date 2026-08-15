const MAX_CACHE_ENTRIES = 32;

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const numberFormatters = new Map<string, Intl.NumberFormat>();
const wordSegmenters = new Map<string, Intl.Segmenter>();

function optionsKey(options: object): string {
  return JSON.stringify(Object.entries(options).sort(([left], [right]) => left.localeCompare(right)));
}

function formatterKey(locale: string | undefined, options: object): string {
  return JSON.stringify([locale ?? null, optionsKey(options)]);
}

function cachedValue<T>(cache: Map<string, T>, key: string, create: () => T): T {
  const existing = cache.get(key);
  if (existing !== undefined) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }

  const value = create();
  cache.set(key, value);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return value;
}

export function dateTimeFormatter(
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  const key = formatterKey(locale, options);
  return cachedValue(dateTimeFormatters, key, () => new Intl.DateTimeFormat(locale, options));
}

export function numberFormatter(
  locale: string | undefined,
  options: Intl.NumberFormatOptions
): Intl.NumberFormat {
  const key = formatterKey(locale, options);
  return cachedValue(numberFormatters, key, () => new Intl.NumberFormat(locale, options));
}

export function wordSegmenter(locale?: string): Intl.Segmenter | null {
  if (typeof Intl.Segmenter !== "function") return null;
  const key = locale ?? "";
  return cachedValue(wordSegmenters, key, () => new Intl.Segmenter(locale, { granularity: "word" }));
}
