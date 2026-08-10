import { D, ZERO } from '@/lib/money';
import type { Holding } from '@/lib/types';
import { demoDayChangePct, dayKey } from '@/lib/demo/marketFeed';
import { formatDayMonth } from '@/lib/dateFormat';

/**
 * Today's move across the book.
 *
 * WHY THIS EXISTS
 *
 * The dashboard used to synthesise a day change for every holding whenever demo
 * market data was on, and it did that even for a portfolio imported from a real
 * broker. Side by side with the broker's own screen the app read −0.31% against
 * a real +0.24% — the wrong number and the wrong sign, on a card that a reader
 * has no reason to distrust.
 *
 * So: a real day change comes from `previousClose`, which the CSV importer now
 * records whenever the broker's export carries a previous close or a day-P&L
 * column. Real and fabricated figures are NEVER blended into one total — the
 * moment a single holding has a real previous close, the fabricated ones are
 * dropped and `covered` says how much of the book the answer actually speaks
 * for.
 */
export interface DayChange {
  /** Absolute move in base currency, or null when nothing can be said. */
  pnl: number | null;
  /** Move as a percentage of the covered value, or null. */
  pct: number | null;
  /** False when the figure came from the demo feed and must carry a badge. */
  isReal: boolean;
  /** Holdings the figure covers. */
  covered: number;
  /** Holdings in the book. `covered < total` means the figure is partial. */
  total: number;
}

export const NO_DAY_CHANGE: DayChange = {
  pnl: null, pct: null, isReal: false, covered: 0, total: 0,
};

/** A holding whose day move can be stated as fact rather than synthesised. */
function isPriced(h: Holding): boolean {
  return h.previousClose != null && h.previousClose !== ''
    && h.lastPrice != null && h.lastPrice !== '';
}

/**
 * Whether the book carries any real previous close.
 *
 * Decided once per table, not per row: the moment one position can be measured
 * for real, every other row must say "—" rather than fall back to the demo
 * feed, or a single column would mix fact and fiction with nothing to tell
 * them apart.
 */
export function hasRealClose(holdings: Holding[]): boolean {
  return holdings.some((h) => h.previousClose != null && h.previousClose !== '');
}

/**
 * One row's move today, as a percentage.
 *
 * @param anyReal result of `hasRealClose` for the whole book — pass it in
 *   rather than recomputing, so every row in a table shares one verdict.
 * @param demo whether the demo market feed is switched on.
 */
export function rowDayPct(h: Holding, anyReal: boolean, demo: boolean): number | null {
  if (isPriced(h)) {
    return D(h.lastPrice!).minus(D(h.previousClose!)).div(D(h.previousClose!)).times(100).toNumber();
  }
  if (anyReal || !demo) return null;
  return demoDayChangePct(h.symbol);
}

/**
 * What a real day change is actually measuring.
 *
 * Prices only move when a broker file is imported, so "today" can quietly mean
 * last Thursday. When the newest price predates today the label names its date
 * rather than letting the card imply a live figure. Presentation only — a
 * stale close is still a real close, and gating the calculation on freshness
 * would blank the card every Monday morning.
 */
export function priceAsOfLabel(holdings: Holding[], now: number): string {
  const stamps = holdings.filter(isPriced).map((h) => h.priceAsOf).filter((t): t is number => t != null);
  if (stamps.length === 0) return 'Against yesterday’s close';
  // Reduced, not `Math.max(...stamps)`: spreading an array into an argument
  // list throws `RangeError` once a portfolio is large enough, and the failure
  // would land on the dashboard of exactly the users who hold the most.
  const newest = stamps.reduce((m, t) => (t > m ? t : m), stamps[0]);
  if (dayKey(new Date(newest)) === dayKey(new Date(now))) return 'Against yesterday’s close';
  return `Prices from ${formatDayMonth(newest)}`;
}

/**
 * @param demo whether the demo market feed is switched on. Only consulted when
 *   no holding carries a real previous close.
 */
export function dayChange(holdings: Holding[], demo: boolean): DayChange {
  const total = holdings.length;
  if (total === 0) return { ...NO_DAY_CHANGE };

  const real = holdings.filter(isPriced);

  if (real.length > 0) {
    let pnl = ZERO;
    let value = ZERO;
    for (const h of real) {
      const qty = D(h.quantity);
      const prev = D(h.previousClose!);
      const last = D(h.lastPrice!);
      pnl = pnl.plus(last.minus(prev).times(qty));
      // The denominator is the covered value, not the whole portfolio: a 2%
      // move on the half of the book we can price is 2%, not 1%.
      value = value.plus(last.times(qty));
    }
    return {
      pnl: pnl.toNumber(),
      pct: value.isZero() ? null : pnl.div(value).times(100).toNumber(),
      isReal: true,
      covered: real.length,
      total,
    };
  }

  if (!demo) return { pnl: null, pct: null, isReal: false, covered: 0, total };

  let pnl = 0;
  let value = 0;
  for (const h of holdings) {
    const current = D(h.lastPrice ?? h.avgCost).times(D(h.quantity)).toNumber();
    pnl += current * (demoDayChangePct(h.symbol) / 100);
    value += current;
  }
  return {
    pnl,
    pct: value === 0 ? null : (pnl / value) * 100,
    isReal: false,
    covered: total,
    total,
  };
}
