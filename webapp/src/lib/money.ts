// Money = arbitrary-precision Decimal (decimal.js). Doubles are never used for
// money — mirrors the Flutter app's `package:decimal` rule.
import Decimal from 'decimal.js';

Decimal.set({ precision: 30 });

export type Money = Decimal;
export const D = (v: Decimal.Value): Decimal => new Decimal(v);
export const ZERO = new Decimal(0);

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
