/**
 * Short-scale number formatting for KPI tiles.
 *
 * Uses the Indian scale (lakh / crore), matching the app's `en-IN` grouping.
 * A tile shows the short form and puts the exact figure in its footer — this
 * is for the headline, never for a number the user has to reconcile.
 */
export function short(n: number, symbol = '₹'): string {
  const a = Math.abs(n);
  if (a >= 1_00_00_000) return `${symbol}${(a / 1_00_00_000).toFixed(2)} Cr`;
  if (a >= 1_00_000) return `${symbol}${(a / 1_00_000).toFixed(2)} L`;
  if (a >= 1_000) return `${symbol}${(a / 1_000).toFixed(1)} K`;
  return `${symbol}${a.toFixed(0)}`;
}

/** Signed short form, e.g. "+₹2.84 L". Uses a true minus sign, not a hyphen. */
export function shortSigned(n: number, symbol = '₹'): string {
  return (n >= 0 ? '+' : '−') + short(n, symbol);
}

/** Signed percentage to two places. */
export function pct(n: number, digits = 2): string {
  return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(digits) + '%';
}
