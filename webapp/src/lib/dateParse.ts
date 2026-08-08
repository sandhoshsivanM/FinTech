/**
 * Date parsing for imported files.
 *
 * `new Date(str)` is not usable here. Given "01/02/2026" it applies US
 * month-first rules and silently returns 1 February for a file that meant
 * 2 January — a whole statement lands in the wrong months and nothing looks
 * broken. Indian bank and broker exports are overwhelmingly day-first, so we
 * parse explicitly and only ever fall back to the engine for ISO input, which
 * is unambiguous.
 */

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Two-digit years: 70–99 → 19xx, 00–69 → 20xx. */
function fullYear(y: number): number {
  if (y >= 1000) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

function build(y: number, m: number, d: number): number | null {
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  const dt = new Date(y, m, d);
  // Rejects overflow like 31 February, which Date would roll into March.
  if (dt.getFullYear() !== y || dt.getMonth() !== m || dt.getDate() !== d) return null;
  return dt.getTime();
}

/**
 * Parses a date cell to epoch ms at local midnight, or null.
 *
 * `dayFirst` defaults to true. It only matters when both parts are ≤ 12; when
 * one exceeds 12 the order is unambiguous and is honoured regardless.
 */
export function parseDateCell(raw: string, dayFirst = true): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  // ISO 8601 — unambiguous, always year-first.
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return build(+iso[1], +iso[2] - 1, +iso[3]);

  // Named month: 15-Feb-2026, 15 Feb 26, Feb 15 2026
  const named = s.match(/^(\d{1,2})[-\s/]*([A-Za-z]{3,})[-\s/]*(\d{2,4})/);
  if (named) {
    const m = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (m !== undefined) return build(fullYear(+named[3]), m, +named[1]);
  }
  const namedFirst = s.match(/^([A-Za-z]{3,})[-\s/]*(\d{1,2})[,\s-]+(\d{2,4})/);
  if (namedFirst) {
    const m = MONTHS[namedFirst[1].slice(0, 3).toLowerCase()];
    if (m !== undefined) return build(fullYear(+namedFirst[3]), m, +namedFirst[2]);
  }

  // Numeric: 15/02/2026, 15-02-26, 15.02.2026
  const numeric = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (numeric) {
    const a = +numeric[1];
    const b = +numeric[2];
    const y = fullYear(+numeric[3]);
    // One part over 12 settles the order no matter what the caller assumed.
    if (a > 12) return build(y, b - 1, a);
    if (b > 12) return build(y, a - 1, b);
    return dayFirst ? build(y, b - 1, a) : build(y, a - 1, b);
  }

  return null;
}

/**
 * Decides whether a column is day-first by looking at the whole column.
 *
 * A single "05/03/2026" is unknowable, but one "17/03/2026" anywhere in the
 * file proves the column is day-first. This is why detection is a column-level
 * decision rather than a per-cell guess — the alternative is a statement whose
 * first half is read day-first and second half month-first.
 */
export function detectDayFirst(cells: string[]): boolean {
  let dayFirstEvidence = 0;
  let monthFirstEvidence = 0;
  for (const c of cells) {
    const m = String(c ?? '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (!m) continue;
    const a = +m[1];
    const b = +m[2];
    if (a > 12 && b <= 12) dayFirstEvidence++;
    else if (b > 12 && a <= 12) monthFirstEvidence++;
  }
  if (dayFirstEvidence || monthFirstEvidence) return dayFirstEvidence >= monthFirstEvidence;
  return true; // Indian exports default to day-first
}
