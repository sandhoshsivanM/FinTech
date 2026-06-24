'use client';
// Currency-aware money formatter. The ledger stores INR; this converts every
// displayed amount into the user's chosen display currency (Settings → Display
// currency). Use these instead of formatMoney/formatSigned directly in screens.
import type Decimal from 'decimal.js';
import { useApp } from './store';
import { findCurrency, formatIn, fromInr } from '@/domain/currency';

export interface Fmt {
  /** Format an INR-denominated amount in the active display currency. */
  money: (amountInr: Decimal.Value) => string;
  /** Signed (+/-) variant. */
  signed: (amountInr: Decimal.Value, isIncome: boolean) => string;
  /** Convert an INR amount to a plain number in the display currency (for charts). */
  toNum: (amountInr: Decimal.Value) => number;
  code: string;
  symbol: string;
}

export function useFmt(): Fmt {
  const code = useApp((s) => s.currencyCode);
  const cur = findCurrency(code);
  return {
    money: (v) => formatIn(v, cur),
    signed: (v, isIncome) => (isIncome ? '+' : '-') + formatIn(typeof v === 'object' && 'abs' in v ? v.abs() : Math.abs(Number(v)), cur),
    toNum: (v) => fromInr(v, cur).toNumber(),
    code: cur.code,
    symbol: cur.symbol,
  };
}
