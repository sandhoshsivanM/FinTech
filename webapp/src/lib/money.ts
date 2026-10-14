// Money = arbitrary-precision Decimal (decimal.js). Doubles are never used for
// money — mirrors the Flutter app's `package:decimal` rule.
import Decimal from 'decimal.js';

Decimal.set({ precision: 30 });

export type Money = Decimal;
export const ZERO = new Decimal(0);

/**
 * Money strings that reach here should already be clean decimals, but some
 * are not: a value typed into a form, pasted from a statement, or written by
 * an older build can carry a trailing space, a currency symbol, thousands
 * separators or a zero-width character.
 *
 * decimal.js rejects every one of those with `Invalid argument` — and because
 * `D()` is called during render, a single bad record used to throw on every
 * paint and take the whole screen down with it. Worse, the thrown message
 * prints the value verbatim, so `"72.00 "` reads as a perfectly valid `72.00`
 * and the cause is invisible.
 *
 * So the parse is tolerant: recover the number the value obviously means,
 * rather than dying on its formatting. A record already stored with a stray
 * space therefore fixes itself on read, with no migration and no re-entry.
 *
 * Anything genuinely unparseable yields zero and warns — a wrong figure on one
 * row is recoverable; a screen that will not open is not.
 */
export function D(v: Decimal.Value): Decimal {
  if (typeof v !== 'string') {
    try {
      return new Decimal(v);
    } catch {
      console.warn('[Khazana] unusable money value, treating as zero:', v);
      return ZERO;
    }
  }

  // Fast path: the overwhelming majority are already clean.
  try {
    return new Decimal(v);
  } catch {
    // fall through
  }

  const cleaned = v
    .replace(/[\s ​‎‏]/g, '') // spaces, NBSP, zero-width marks
    .replace(/[₹$€£¥,'_]/g, '')                   // symbols and group separators
    .replace(/^\((.*)\)$/, '-$1');                // accounting negative

  if (cleaned === '' || cleaned === '-') return ZERO;

  try {
    return new Decimal(cleaned);
  } catch {
    console.warn('[Khazana] unusable money value, treating as zero:', JSON.stringify(v));
    return ZERO;
  }
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

/// Indian-grouped currency, e.g. ₹24,56,780.00
export function formatMoney(v: Decimal.Value): string {
  return inr.format(new Decimal(v).toNumber());
}

export function formatSigned(v: Decimal.Value, isIncome: boolean): string {
  const s = formatMoney(new Decimal(v).abs());
  return (isIncome ? '+' : '-') + s;
}
