import type { CalendarLayout, DailyRecord, PeriodMode } from "./types";

export function normalizeCalendarLayout(value: unknown): CalendarLayout {
  return value === "margin" ? "margin" : "standard";
}

export function calendarPeriodMode(mode: PeriodMode, layout: CalendarLayout): PeriodMode {
  return layout === "margin" ? "month" : mode;
}

export function marginWritingWords(record: DailyRecord | null): number {
  return record ? record.words + (record.linkedWords ?? 0) : 0;
}

interface WritingCoil { path: string; connectors: string }
const coilThresholds = [200, 320, 480, 700];
const writingCoils = new Map<number, WritingCoil>();
const maxWritingCoils = 256;

/** A per-view random seed gives each date a stable style, without a growing date cache. */
export function marginWireStyle(iso: string, seed: number): number {
  let hash = seed | 0;
  for (let index = 0; index < iso.length; index++) hash = Math.imul(hash ^ iso.charCodeAt(index), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

/** Seeded wire geometry, centered at x=8 in a 16 × 44 viewport. */
export function marginWritingCoil(words: number, style = 0): WritingCoil {
  const count = Number.isFinite(words) ? Math.max(0, words) : 0;
  const level = count < 120 ? Math.floor(count / 10)
    : 12 + coilThresholds.reduce((total, threshold) => total + Number(count >= threshold), 0);
  // Straight notes share a shape; other dates have independently varied turns.
  const seed = level < 3 ? 0 : style >>> 0;
  const key = seed * 17 + level;
  const cached = writingCoils.get(key);
  if (cached) return cached;
  let state = seed;
  const random = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
  const turns = Math.max(1, level - 11);
  const direction = random() < .5 ? -1 : 1;
  const width = 3 + random() * 1.1;
  const lean = (random() - .5) * .8;
  const pitch = 4.2 + random() * .8;
  const depth = 2.1 + random() * 1.2;
  const loops = Array.from({ length: turns + 1 }, () => ({
    right: 8 + direction * (width * (.9 + random() * .2) + lean),
    left: 8 - direction * (width * (.9 + random() * .2) - lean),
    pitch: pitch + (random() - .5) * .6,
    depth: depth + (random() - .5) * .4
  }));
  const length = loops.slice(0, turns).reduce((total, loop) => total + loop.pitch, 8);
  const top = (44 - length) / 2;
  // Brief notes remain straight or gently bowed, easing into a full turn at 120.
  const progress = Math.min(1, Math.max(0, (level - 6) / 6));
  const curl = progress * progress * (3 - 2 * progress);
  const bow = Math.min(1, Math.max(0, (level - 2) / 4)) * 1.25;
  const spread = bow / 8 + (1 - bow / 8) * curl;
  const round = (value: number): number => +value.toFixed(3);
  const path = [`M8 ${round(top)}`];
  let segment = 0;
  // Interpolating Bézier controls gives the same easing without sampled polylines.
  const point = (x: number, y: number, fraction: number): string => {
    const baseline = top + (segment + fraction) / (turns * 2 + 2) * length;
    return `${round(8 + (x - 8) * spread)} ${round(baseline + (y - baseline) * curl)}`;
  };
  const curve = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void => {
    path.push(`C${point(x1, y1, 1 / 3)} ${point(x2, y2, 2 / 3)} ${point(x3, y3, 1)}`);
    segment++;
  };
  curve(8, top + 2, loops[0].right, top + 1, loops[0].right, top + 4);
  let y = top + 4;
  for (let turn = 0; turn < turns; turn++) {
    const loop = loops[turn], next = loops[turn + 1];
    curve(loop.right, y + loop.depth, loop.left, y + loop.depth, loop.left, y);
    curve(loop.left, y - loop.depth, next.right, y - loop.depth, next.right, y + loop.pitch);
    y += loop.pitch;
  }
  const end = top + length;
  curve(loops[turns].right, end - 1, 8, end - 2, 8, end);
  const shape = {
    path: path.join(" "),
    connectors: `M8 0 L8 ${round(top)} M8 ${round(end)} L8 44`
  };
  // FIFO eviction bounds memory across long scroll sessions without storing dates.
  if (writingCoils.size >= maxWritingCoils) writingCoils.delete(writingCoils.keys().next().value!);
  writingCoils.set(key, shape);
  return shape;
}
