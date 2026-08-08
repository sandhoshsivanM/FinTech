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

const _ones = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const _tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];

function two(n: number): string {
  if (n < 20) return _ones[n];
  const t = _tens[Math.floor(n / 10)];
  const o = n % 10;
  return o === 0 ? t : `${t}-${_ones[o]}`;
}
function three(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h === 0) return two(r);
  return r === 0 ? `${_ones[h]} hundred` : `${_ones[h]} hundred ${two(r)}`;
}
function indianWords(n: number): string {
  if (n < 1000) return three(n);
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const below = n % 1000;
  if (crore > 0) parts.push(`${indianWords(crore)} crore`);
  if (lakh > 0) parts.push(`${two(lakh)} lakh`);
  if (thousand > 0) parts.push(`${two(thousand)} thousand`);
  if (below > 0) parts.push(three(below));
  return parts.join(' ');
}

/// Accessible words for screen readers (PRD §10A): "Ten thousand rupees".
export function moneyToWords(v: Decimal.Value): string {
  const d = new Decimal(v);
  const neg = d.isNegative();
  const abs = d.abs();
  const rupees = abs.floor().toNumber();
  const paise = abs.minus(abs.floor()).times(100).round().toNumber();
  let out = neg ? 'minus ' : '';
  out += `${indianWords(rupees)} ${rupees === 1 ? 'rupee' : 'rupees'}`;
  if (paise > 0) out += ` and ${indianWords(paise)} paise`;
  return out;
}
