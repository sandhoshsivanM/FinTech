/**
 * Downloadable CSV templates.
 *
 * Built as strings rather than shipped as static files so the example rows can
 * carry real dates and the app's own category names — a template whose dates
 * are three years stale teaches the wrong format on sight.
 */
import { DEFAULT_CATEGORIES } from './store';

function csv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\n');
}

/** yyyy-mm-dd, `daysAgo` before `now`. */
function isoDay(now: number, daysAgo: number): string {
  return new Date(now - daysAgo * 86400000).toISOString().slice(0, 10);
}

export function holdingsTemplate(now = Date.now()): string {
  void now;
  return csv([
    ['Symbol', 'Exchange', 'Quantity', 'Avg Cost', 'LTP', 'Prev Close'],
    ['INFY', 'NSE', 25, 1420.5, 1583.2, 1571.4],
    ['TCS', 'NSE', 10, 3550, 3712.85, 3698.1],
    ['HDFCBANK', 'NSE', 40, 1610.25, 1688.4, 1692.75],
  ]);
}

export function transactionsTemplate(now = Date.now()): string {
  const cats = DEFAULT_CATEGORIES.map((c) => c.name);
  const pick = (n: string) => (cats.includes(n) ? n : '');
  return csv([
    ['date', 'description', 'amount', 'currency', 'type', 'category', 'from_account', 'to_account', 'notes'],
    [isoDay(now, 2), 'Salary credit', 85000, 'INR', 'IN', pick('Salary'), '', '', 'Monthly payroll'],
    [isoDay(now, 3), 'Blinkit groceries', 1240.5, 'INR', 'OUT', pick('Food'), '', '', ''],
    [isoDay(now, 5), 'Electricity bill', 2310, 'INR', 'OUT', pick('Utilities'), '', '', ''],
    [isoDay(now, 6), 'Move to savings', 20000, 'INR', 'TRANSFER', '', 'HDFC Current', 'HDFC Savings', ''],
    [isoDay(now, 9), 'Auto-detect this one', 460, 'INR', 'OUT', '', '', '', 'Blank category is guessed from the description'],
  ]);
}

/** Triggers a client-side download. No server round-trip; nothing leaves the device. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
