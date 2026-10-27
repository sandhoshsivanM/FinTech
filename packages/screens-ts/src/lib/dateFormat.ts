/**
 * One date format for the whole app: dd/MM/yyyy.
 *
 * Every screen used to call `toLocaleDateString` with its own options object,
 * so the same day appeared as "8 Aug", "08 Aug 2026" and "Aug 26" depending on
 * where you looked, and the editable inputs showed whatever the *browser's*
 * locale decided — which on a US-locale machine is mm/dd/yyyy, i.e. the same
 * digits meaning a different day. Formatting is centralised here so that class
 * of inconsistency cannot come back.
 *
 * `parseDateCell` (dateParse.ts) is the matching reader; it is already
 * day-first and unit-tested, so typed input and imported files agree.
 */

const pad = (n: number) => String(n).padStart(2, '0');

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** dd/MM/yyyy — the app's canonical date. */
export function formatDate(ms: number | Date): string {
  const d = ms instanceof Date ? ms : new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** dd/MM — for axes and dense rows where the year is already implied. */
export function formatDayMonth(ms: number | Date): string {
  const d = ms instanceof Date ? ms : new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/**
 * MMM yyyy — month buckets in charts and reports.
 *
 * Deliberately *not* numeric: "03/2026" next to a dd/MM axis label is
 * ambiguous at a glance, whereas "Mar 2026" can only be a month.
 */
export function formatMonthYear(ms: number | Date): string {
  const d = ms instanceof Date ? ms : new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** MMM yy — the compact axis variant. */
export function formatMonthShort(ms: number | Date): string {
  const d = ms instanceof Date ? ms : new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTH_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

/** Weekday + dd/MM/yyyy, for the calendar header. */
export function formatLongDate(ms: number | Date): string {
  const d = ms instanceof Date ? ms : new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
  return `${weekday}, ${formatDate(d)}`;
}

/* -------------------------------------------------------------------------- */
/* Input-value plumbing                                                       */
/* -------------------------------------------------------------------------- */

/**
 * yyyy-MM-dd — the only format `<input type="date">` accepts as a value, and
 * what we store in form state.
 *
 * Built from local parts rather than `toISOString()`: that converts to UTC, so
 * for anyone east of Greenwich a date late in the day slides to the day before.
 */
export function toInputValue(ms: number | Date): string {
  const d = ms instanceof Date ? ms : new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight epoch for a yyyy-MM-dd string. Inverse of `toInputValue`. */
export function fromInputValue(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** Today as yyyy-MM-dd, for form defaults. */
export const todayInputValue = (): string => toInputValue(Date.now());
