// Multi-currency display (PRD §12). The ledger stores INR; this converts for
// display using user-editable rates (1 unit of CUR = `rate` INR). Local-only.
import Decimal from 'decimal.js';
import { D } from '@/lib/money';

export interface Currency { code: string; symbol: string; name: string; rateToInr: number }

export const CURRENCIES: Currency[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', rateToInr: 1 },
  { code: 'USD', symbol: '$', name: 'US Dollar', rateToInr: 83.3 },
  { code: 'EUR', symbol: '€', name: 'Euro', rateToInr: 90.1 },
  { code: 'GBP', symbol: '£', name: 'British Pound', rateToInr: 105.7 },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', rateToInr: 22.7 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', rateToInr: 61.6 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', rateToInr: 0.53 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', rateToInr: 54.2 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', rateToInr: 60.9 },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc', rateToInr: 92.0 },
];

export function findCurrency(code: string): Currency {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

/** Convert an INR-denominated amount into the target currency. */
export function fromInr(amountInr: Decimal.Value, target: Currency): Decimal {
  if (target.code === 'INR' || target.rateToInr === 0) return D(amountInr);
  return D(amountInr).div(target.rateToInr);
}

export function formatIn(amountInr: Decimal.Value, target: Currency): string {
  const v = fromInr(amountInr, target).toNumber();
  try {
    return new Intl.NumberFormat(target.code === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency', currency: target.code, maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${target.symbol}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
}
