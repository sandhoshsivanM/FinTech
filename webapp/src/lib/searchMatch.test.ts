// Reconciling against a spreadsheet means searching for the figure. The stored
// value is a Decimal string ("1500.00"), so "1500" and "1,500" must both find
// it — before this, searching an amount matched nothing and the transaction
// looked missing from the book.
import { describe, expect, test } from 'vitest';

/** Mirrors amountMatches in app/transactions/page.tsx. */
function amountMatches(amount: string, needle: string): boolean {
  const n = needle.replace(/[₹$,\s]/g, '');
  if (!n || !/^[0-9]*\.?[0-9]*$/.test(n)) return false;
  const raw = amount.replace(/[^0-9.]/g, '');
  const num = Number(raw);
  if (!Number.isFinite(num)) return raw.includes(n);
  return raw.includes(n) || String(num).includes(n) || num.toFixed(2).includes(n);
}

describe('amountMatches', () => {
  test('finds a stored 1500.00 by every form a person types', () => {
    for (const typed of ['1500', '1500.00', '1,500', '₹1500', '₹1,500.00']) {
      expect(amountMatches('1500.00', typed)).toBe(true);
    }
  });

  test('finds an amount stored without decimals', () => {
    expect(amountMatches('1500', '1500')).toBe(true);
    expect(amountMatches('1500', '1500.00')).toBe(true);
  });

  test('partial figures still match, which is what a scan wants', () => {
    expect(amountMatches('1500.00', '15')).toBe(true);
    expect(amountMatches('21500.00', '1500')).toBe(true);
  });

  test('does not match an unrelated amount', () => {
    expect(amountMatches('250.00', '1500')).toBe(false);
  });

  test('non-numeric searches are left to the text fields', () => {
    // "swiggy" must not be coerced into an amount comparison.
    expect(amountMatches('1500.00', 'swiggy')).toBe(false);
    expect(amountMatches('1500.00', '')).toBe(false);
    expect(amountMatches('1500.00', '15a')).toBe(false);
  });

  test('decimals are searchable', () => {
    expect(amountMatches('1240.50', '.5')).toBe(true);
    expect(amountMatches('1240.50', '1240.5')).toBe(true);
  });
});
