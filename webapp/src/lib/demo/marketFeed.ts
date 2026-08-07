/**
 * Demo market feed.
 *
 * This app makes no network calls — that is a product promise, not an
 * omission (see `domain/instrumentMaster.ts`). But several screens the design
 * calls for — Markets, News, day-change columns, index levels — are meaningless
 * without a feed. Rather than fetch, this module SYNTHESISES that data.
 *
 * Three rules keep it honest:
 *
 *   1. It is deterministic. Values are hashed from the symbol and the calendar
 *      day, so the same instrument shows the same number all day, across
 *      reloads and across screens. Nothing here calls Math.random().
 *   2. It never touches stored data. Real holdings, prices and dividends the
 *      user entered are read, never overwritten.
 *   3. Every surface that renders it is labelled. Use `<DemoBadge />` and
 *      respect `demoMarketData` in settings — a synthesised quote must never be
 *      mistakable for a real one.
 */

/** Deterministic 0..1 from an arbitrary string. xorshift-style integer hash. */
function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >>> 16)) >>> 8) / 16777216;
}

/** Calendar day key in IST — the feed changes once a day, not once a render. */
export function dayKey(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60_000);
  return ist.toISOString().slice(0, 10);
}

/**
 * Day change for a symbol, as a percentage in roughly [-2.6, +2.6].
 * Stable for the whole trading day.
 */
export function demoDayChangePct(symbol: string, now: Date = new Date()): number {
  const r = hash01(`${symbol}|${dayKey(now)}`);
  // Centre on zero and give the tails a little less weight than the middle.
  const x = (r - 0.5) * 2;
  return Number((x * Math.abs(x) * 2.6).toFixed(2));
}

/** Previous close implied by a current price and the day's change. */
export function demoPreviousClose(symbol: string, lastPrice: number, now: Date = new Date()): number {
  const pct = demoDayChangePct(symbol, now);
  return lastPrice / (1 + pct / 100);
}

export type RangeKey = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '3Y' | 'ALL';

/** Number of points and the total drift each range covers. */
const RANGE_SPEC: Record<RangeKey, { points: number; days: number; vol: number }> = {
  '1D': { points: 78, days: 1, vol: 0.10 },
  '1W': { points: 60, days: 7, vol: 0.16 },
  '1M': { points: 72, days: 30, vol: 0.22 },
  '3M': { points: 90, days: 90, vol: 0.26 },
  '6M': { points: 110, days: 182, vol: 0.30 },
  '1Y': { points: 140, days: 365, vol: 0.34 },
  '3Y': { points: 160, days: 1095, vol: 0.42 },
  ALL: { points: 180, days: 1825, vol: 0.48 },
};

export const RANGE_KEYS: RangeKey[] = ['1D', '1W', '1M', '3M', '6M', '1Y', '3Y', 'ALL'];

/** Human labels for a range's x-axis. */
export function rangeLabels(range: RangeKey, now: Date = new Date()): string[] {
  const month = (d: Date) => d.toLocaleDateString('en-IN', { month: 'short' });
  const back = (days: number) => new Date(now.getTime() - days * 86400_000);
  switch (range) {
    case '1D': return ['09:15', '11:00', '12:45', '14:30', '15:30'];
    case '1W': return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    case '1M': return ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4'];
    case '3M': return [month(back(90)), month(back(45)), month(now)];
    case '6M': return [month(back(182)), month(back(120)), month(back(60)), month(now)];
    case '1Y': return [month(back(365)), month(back(270)), month(back(180)), month(back(90)), month(now)];
    case '3Y': {
      const y = now.getFullYear();
      return [`${y - 3}`, `${y - 2}`, `${y - 1}`, `${y}`];
    }
    case 'ALL': {
      const y = now.getFullYear();
      return [`${y - 5}`, `${y - 3}`, `${y - 1}`, `${y}`];
    }
  }
}

/**
 * A plausible value series ending exactly at `endValue`.
 *
 * `startValue` anchors the left edge; the walk in between is smooth, seeded and
 * mean-reverting, so it reads like a market rather than like noise. The last
 * point is pinned to `endValue` because that figure is REAL — it is the
 * portfolio's actual current value — and the chart must not contradict the
 * number printed above it.
 */
export function demoSeries(
  seed: string,
  range: RangeKey,
  endValue: number,
  startValue?: number,
): number[] {
  const spec = RANGE_SPEC[range];
  const n = spec.points;
  // Longer ranges start further back, so growth reads as growth.
  const growth = { '1D': 0.006, '1W': 0.014, '1M': 0.045, '3M': 0.10, '6M': 0.17, '1Y': 0.27, '3Y': 0.62, ALL: 1.15 }[range];
  const start = startValue ?? endValue / (1 + growth);

  const out: number[] = [];
  let drift = 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = hash01(`${seed}|${range}|${i}`) - 0.5;
    drift = drift * 0.72 + r * spec.vol;
    // Two waves at different frequencies keep it from looking sinusoidal.
    const wave = Math.sin(t * Math.PI * 3.1) * spec.vol * 0.5 + Math.sin(t * Math.PI * 7.3) * spec.vol * 0.22;
    // Taper the noise toward both ends so the anchors are not violent jumps.
    const taper = 1 - Math.abs(t - 0.5) * 1.2;
    out.push(start + (endValue - start) * Math.pow(t, 0.94) + (drift + wave) * (endValue - start) * taper);
  }
  out[0] = start;
  out[n - 1] = endValue;
  return out;
}

// ---- Indices ---------------------------------------------------------------
export interface IndexQuote {
  symbol: string;
  name: string;
  level: number;
  changePct: number;
  /** Decimal places for display. */
  digits: number;
}

const INDEX_BASE: Array<[string, string, number, number]> = [
  ['NIFTY50', 'NIFTY 50', 27412, 2],
  ['SENSEX', 'SENSEX', 89640, 2],
  ['BANKNIFTY', 'BANK NIFTY', 61208, 2],
  ['INDIAVIX', 'INDIA VIX', 11.4, 2],
  ['USDINR', 'USD / INR', 83.42, 2],
];

export function demoIndices(now: Date = new Date()): IndexQuote[] {
  return INDEX_BASE.map(([symbol, name, base, digits]) => {
    const changePct = demoDayChangePct(symbol, now);
    return { symbol, name, digits, changePct, level: base * (1 + changePct / 200) };
  });
}

// ---- Earnings calendar -----------------------------------------------------
export interface EarningsEntry { symbol: string; quarter: string; date: number }

/**
 * Upcoming results for symbols the user actually holds, spread across the next
 * eight weeks. Deterministic per symbol, so the date does not jump about.
 */
export function demoEarnings(symbols: string[], now: Date = new Date()): EarningsEntry[] {
  const q = `Q${Math.floor(now.getMonth() / 3) + 1} FY${String((now.getFullYear() + 1) % 100).padStart(2, '0')}`;
  return symbols
    .map((symbol) => {
      const offset = 4 + Math.floor(hash01(`earn|${symbol}|${dayKey(now)}`) * 52);
      return { symbol, quarter: q, date: now.getTime() + offset * 86400_000 };
    })
    .sort((a, b) => a.date - b.date);
}
