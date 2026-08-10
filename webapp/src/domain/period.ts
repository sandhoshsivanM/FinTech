/**
 * One time model for the whole app.
 *
 * Before this, every screen computed its own window and they did not agree.
 * There were four vocabularies in play — calendar months (`monthRange`),
 * trailing days (`WINDOW_DAYS`), the dashboard's own day counts, and hand-rolled
 * financial-year arithmetic — so the same metric could differ between two
 * screens that both claimed to show "3 months". Reports was the worst case: its
 * KPI tiles used calendar months while the sparkline beside them used trailing
 * 90 days, both captioned identically.
 *
 * A `DateRange` is the only way to express a period. It is immutable, it is
 * always resolved to concrete instants before any query runs, and it carries
 * the label the UI must show — so a screen cannot display a period different
 * from the one it queried.
 *
 * Boundary contract, stated once and relied on everywhere: **both ends are
 * inclusive**. `start` is local 00:00:00.000 of the first day, `end` is local
 * 23:59:59.999 of the last. Comparisons are therefore `date >= start &&
 * date <= end`, never `< end`. Local time, not UTC: a person's August is the
 * August on their wall, and building these from `toISOString` slides the
 * boundary a day for anyone east of Greenwich.
 */

const MS_DAY = 86_400_000;

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * How a range was chosen. Drives labelling and, for `month`, whether the
 * previous/next affordances are meaningful.
 */
export type PeriodKind = 'month' | 'trailing' | 'fy' | 'custom';

export interface DateRange {
  /** Local 00:00:00.000 of the first day, inclusive. */
  readonly start: number;
  /** Local 23:59:59.999 of the last day, inclusive. */
  readonly end: number;
  readonly kind: PeriodKind;
  /** What the user must see on screen for this range. */
  readonly label: string;
}

/* -------------------------------------------------------------------------- */
/* Boundary primitives                                                        */
/* -------------------------------------------------------------------------- */

/** Local 00:00:00.000 of the day containing `ms`. */
export const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Local 23:59:59.999 of the day containing `ms`. */
export const endOfDay = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1;
};

/** Whether an instant falls inside a range. The one containment rule. */
export const contains = (r: DateRange, ms: number): boolean => ms >= r.start && ms <= r.end;

/**
 * Whole days spanned, both ends counted.
 *
 * Measured midnight-to-midnight and rounded, so a day that is 23 or 25 hours
 * long across a daylight-saving change still counts as one day.
 */
export const daysIn = (r: DateRange): number =>
  Math.round((startOfDay(r.end) - startOfDay(r.start)) / MS_DAY) + 1;

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

/** "August 2026 · 1–31 Aug" — a month, with its resolved days spelled out. */
function monthLabel(year: number, month: number, start: number, end: number): string {
  const from = new Date(start).getDate();
  const to = new Date(end).getDate();
  return `${MONTH_LONG[month]} ${year} · ${from}–${to} ${MONTH_SHORT[month]}`;
}

/**
 * "Jun 1 – Aug 31, 2026" — a span. Never a relative token like "3M": the whole
 * point is that the reader can see which days were actually counted.
 */
function spanLabel(start: number, end: number): string {
  const a = new Date(start);
  const b = new Date(end);
  const left = `${MONTH_SHORT[a.getMonth()]} ${a.getDate()}`;
  const right = `${MONTH_SHORT[b.getMonth()]} ${b.getDate()}`;
  return a.getFullYear() === b.getFullYear()
    ? `${left} – ${right}, ${b.getFullYear()}`
    : `${left}, ${a.getFullYear()} – ${right}, ${b.getFullYear()}`;
}

/* -------------------------------------------------------------------------- */
/* PeriodService                                                              */
/* -------------------------------------------------------------------------- */

/** The calendar month containing `ms`. */
export function forMonth(ms: number): DateRange {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = d.getMonth();
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime() - 1;
  return { start, end, kind: 'month', label: monthLabel(year, month, start, end) };
}

/** The month `n` months from the one containing `ms`; negative goes back. */
export function shiftMonths(ms: number, n: number): DateRange {
  const d = new Date(ms);
  return forMonth(new Date(d.getFullYear(), d.getMonth() + n, 1).getTime());
}

export const currentMonth = (now: number = Date.now()): DateRange => forMonth(now);
export const previousMonth = (now: number = Date.now()): DateRange => shiftMonths(now, -1);
export const nextMonth = (now: number = Date.now()): DateRange => shiftMonths(now, 1);

/**
 * The last `n` whole calendar months, ending with the month containing `now`.
 *
 * Calendar months, not `n × 30` days: "3 months" ending mid-August means June,
 * July and August, and a trailing-90-day window silently drops the first week
 * of June while including part of May.
 */
export function monthsBack(n: number, now: number = Date.now()): DateRange {
  const first = shiftMonths(now, -(n - 1));
  const last = forMonth(now);
  return { start: first.start, end: last.end, kind: 'trailing', label: spanLabel(first.start, last.end) };
}

/**
 * The Indian financial year (1 April – 31 March) containing `ms`, truncated at
 * `now` so a year in progress does not claim months that have not happened.
 */
export function financialYearToDate(now: number = Date.now()): DateRange {
  const d = new Date(now);
  const fyStartYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const start = new Date(fyStartYear, 3, 1).getTime();
  const end = endOfDay(now);
  return { start, end, kind: 'fy', label: `FY ${String(fyStartYear).slice(2)}–${String(fyStartYear + 1).slice(2)} · ${spanLabel(start, end)}` };
}

/** An explicit span. Ends are snapped outward to whole days, then ordered. */
export function custom(from: number, to: number): DateRange {
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  const start = startOfDay(lo);
  const end = endOfDay(hi);
  return { start, end, kind: 'custom', label: spanLabel(start, end) };
}

/**
 * A trailing window measured in days, ending at the end of today.
 *
 * Kept for genuinely rolling measures — "spending over the last 30 days" — and
 * deliberately labelled with its resolved dates so it can never be mistaken for
 * a calendar month on screen.
 */
export function trailingDays(days: number, now: number = Date.now()): DateRange {
  const end = endOfDay(now);
  const start = startOfDay(now) - (days - 1) * MS_DAY;
  return { start, end, kind: 'trailing', label: spanLabel(start, end) };
}

/**
 * Each calendar month in a range, oldest first. The bucket list for any
 * month-by-month chart, so every such chart buckets identically.
 */
export function monthsIn(r: DateRange): DateRange[] {
  const out: DateRange[] = [];
  let cursor = forMonth(r.start);
  while (cursor.start <= r.end) {
    out.push(cursor);
    cursor = shiftMonths(cursor.start, 1);
  }
  return out;
}

/** The named presets a period picker offers. `custom` is built, not listed. */
export const PRESETS = {
  thisMonth: (now?: number) => currentMonth(now),
  lastMonth: (now?: number) => previousMonth(now),
  last3Months: (now?: number) => monthsBack(3, now),
  last6Months: (now?: number) => monthsBack(6, now),
  last12Months: (now?: number) => monthsBack(12, now),
  financialYear: (now?: number) => financialYearToDate(now),
} as const;

export type PresetKey = keyof typeof PRESETS;

export const PRESET_LABELS: Record<PresetKey, string> = {
  thisMonth: 'This month',
  lastMonth: 'Last month',
  last3Months: '3 months',
  last6Months: '6 months',
  last12Months: '12 months',
  financialYear: 'This FY',
};
