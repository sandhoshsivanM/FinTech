/**
 * The numbers behind the "skyline" charts: one cell per day, laid out as
 * weeks (columns) by weekdays (rows, Sunday first, as the spend calendar).
 *
 * The grid always runs whole weeks, Sunday to Saturday, so a range that starts
 * mid-week still lines up; days outside the range, and days after today, carry
 * `value: null` and are drawn as empty outlines rather than as zero spending.
 *
 * Money stays Decimal; `value` is the same figure as a plain number, for bar
 * height only. Every figure a card prints comes from the Decimal side.
 */
import Decimal from 'decimal.js';
import { D, ZERO } from './money';
import { isSpending, type NetWorthSnapshot, type Txn } from './types';
import { custom, startOfDay, type DateRange } from './period';

export interface SkyCell {
  /** Local midnight of the day. */
  day: number;
  /** Column, 0 = the first week shown. */
  week: number;
  /** Row, 0 = Sunday. */
  weekday: number;
  /** Null = outside the range or still to come. */
  amount: Decimal | null;
  /** `amount` as a number, for drawing. Signed for portfolio change. */
  value: number | null;
  /** Entries behind the figure (spending), or 0. */
  count: number;
  /** Portfolio change only: the earlier reading this change is measured from. */
  since?: number;
}

export interface Skyline {
  cells: SkyCell[];
  weeks: number;
}

const addDays = (ms: number, n: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
};

/** The `n` whole weeks ending with the week that contains `today`. */
export function lastWeeks(today: number, n: number): DateRange {
  const day = startOfDay(today);
  const sat = addDays(day, 6 - new Date(day).getDay());
  return custom(addDays(sat, -(n * 7) + 1), sat);
}

/** Empty grid of whole weeks covering `range`, with each day's key. */
function grid(range: DateRange, today: number) {
  const first = startOfDay(range.start);
  const gridStart = addDays(first, -new Date(first).getDay());
  const lastDay = startOfDay(range.end);
  const gridEnd = addDays(lastDay, 6 - new Date(lastDay).getDay());
  const cutoff = startOfDay(today);
  const cells: SkyCell[] = [];
  const index = new Map<number, SkyCell>();
  for (let day = gridStart, i = 0; day <= gridEnd; day = addDays(day, 1), i++) {
    const live = day >= first && day <= lastDay && day <= cutoff;
    const cell: SkyCell = { day, week: Math.floor(i / 7), weekday: i % 7, amount: live ? ZERO : null, value: live ? 0 : null, count: 0 };
    cells.push(cell);
    if (live) index.set(day, cell);
  }
  return { cells, index, weeks: cells.length / 7 };
}

/** Spending per day across `range`, up to and including `today`. */
export function spendSkyline(txns: Txn[], range: DateRange, today: number): Skyline {
  const { cells, index, weeks } = grid(range, today);
  for (const t of txns) {
    if (!isSpending(t.type)) continue;
    const cell = index.get(startOfDay(t.date));
    if (!cell) continue;
    cell.amount = cell.amount!.plus(D(t.amount));
    cell.count += 1;
  }
  for (const c of index.values()) c.value = c.amount!.toNumber();
  return { cells, weeks };
}

/**
 * Change in portfolio value per day, from the daily snapshots.
 *
 * A snapshot is taken on days the app is opened, so readings have gaps. A
 * day's change is measured from the previous reading, however far back, and
 * `since` says from when, so the card can say "since 12 Nov" instead of
 * pretending a week's movement happened in one day. Days without a reading
 * have no figure (null), not a zero. It is value change: buying more units
 * raises it as much as a rising market does.
 */
export function portfolioSkyline(snapshots: NetWorthSnapshot[], range: DateRange, today: number): Skyline {
  const { cells, index, weeks } = grid(range, today);
  for (const c of index.values()) { c.amount = null; c.value = null; }
  // Last reading per day, oldest first.
  const byDay = new Map<number, NetWorthSnapshot>();
  for (const s of [...snapshots].sort((a, b) => a.date - b.date)) byDay.set(startOfDay(s.date), s);
  let prev: { day: number; value: Decimal } | null = null;
  for (const [day, s] of byDay) {
    const value = D(s.investments);
    const cell = index.get(day);
    if (cell && prev) {
      cell.amount = value.minus(prev.value);
      cell.value = cell.amount.toNumber();
      cell.since = prev.day;
    }
    prev = { day, value };
  }
  return { cells, weeks };
}

export interface SpendStats {
  total: Decimal;
  busiest: SkyCell | null;
  /** Days in range so far with nothing spent. */
  quietDays: number;
  /** Days in range so far. */
  pastDays: number;
  /** Longest run of consecutive no-spend days. */
  longestQuiet: number;
}

export function spendStats(sky: Skyline): SpendStats {
  let total = ZERO;
  let busiest: SkyCell | null = null;
  let quietDays = 0;
  let pastDays = 0;
  let run = 0;
  let longestQuiet = 0;
  for (const c of sky.cells) {
    if (c.amount == null) continue;
    pastDays += 1;
    total = total.plus(c.amount);
    if (c.amount.isZero()) {
      quietDays += 1;
      run += 1;
      longestQuiet = Math.max(longestQuiet, run);
    } else {
      run = 0;
      if (!busiest || c.amount.gt(busiest.amount!)) busiest = c;
    }
  }
  return { total, busiest, quietDays, pastDays, longestQuiet };
}

export interface ChangeStats {
  /** Sum of the changes shown: first reading in range to the last. */
  net: Decimal;
  best: SkyCell | null;
  worst: SkyCell | null;
  upDays: number;
  downDays: number;
}

export function changeStats(sky: Skyline): ChangeStats {
  let net = ZERO;
  let best: SkyCell | null = null;
  let worst: SkyCell | null = null;
  let upDays = 0;
  let downDays = 0;
  for (const c of sky.cells) {
    if (c.amount == null) continue;
    net = net.plus(c.amount);
    if (c.amount.gt(0)) { upDays += 1; if (!best || c.amount.gt(best.amount!)) best = c; }
    if (c.amount.lt(0)) { downDays += 1; if (!worst || c.amount.lt(worst.amount!)) worst = c; }
  }
  return { net, best, worst, upDays, downDays };
}
