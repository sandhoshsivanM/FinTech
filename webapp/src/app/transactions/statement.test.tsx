// The statement controls: a date window and paging. Both exist so a long book
// can be reconciled against a spreadsheet rather than scrolled.
import { describe, test, expect } from 'vitest';
import { fromInputValue, toInputValue } from '@/lib/dateFormat';

/** Mirrors the page's window maths, including the inclusive end-of-day. */
const windowOf = (from: string, to: string) => ({
  fromMs: fromInputValue(from),
  toMs: (() => { const ms = fromInputValue(to); return ms == null ? null : ms + 86_399_999; })(),
});

const inWindow = (date: number, from: string, to: string) => {
  const { fromMs, toMs } = windowOf(from, to);
  if (fromMs != null && date < fromMs) return false;
  if (toMs != null && date > toMs) return false;
  return true;
};

describe('statement date window', () => {
  const aug1 = new Date(2026, 7, 1, 9, 0).getTime();
  const aug31 = new Date(2026, 7, 31, 23, 30).getTime();
  const sep1 = new Date(2026, 8, 1, 0, 30).getTime();

  test('both ends are inclusive', () => {
    // A monthly statement must contain the 1st and the 31st, including a
    // transaction timed late on the last day.
    expect(inWindow(aug1, '2026-08-01', '2026-08-31')).toBe(true);
    expect(inWindow(aug31, '2026-08-01', '2026-08-31')).toBe(true);
  });

  test('excludes what falls outside', () => {
    expect(inWindow(sep1, '2026-08-01', '2026-08-31')).toBe(false);
  });

  test('an open end means no bound on that side', () => {
    expect(inWindow(sep1, '2026-08-01', '')).toBe(true);
    expect(inWindow(aug1, '', '2026-08-31')).toBe(true);
    expect(inWindow(sep1, '', '')).toBe(true);
  });
});

describe('statement paging', () => {
  const PAGE = 50;
  const pageOf = (total: number, page: number) => {
    const count = Math.max(1, Math.ceil(total / PAGE));
    const safe = Math.min(page, count - 1);
    return { count, safe, start: safe * PAGE, end: Math.min((safe + 1) * PAGE, total) };
  };

  test('a short book is a single page', () => {
    expect(pageOf(12, 0).count).toBe(1);
  });

  test('367 records page cleanly with no gaps or overlap', () => {
    const p = pageOf(367, 0);
    expect(p.count).toBe(8);
    expect(pageOf(367, 7).end).toBe(367);
    expect(pageOf(367, 1).start).toBe(50);
  });

  test('a filter that shrinks the result clamps the page instead of showing nothing', () => {
    // Reader sits on page 8, then narrows the date range to 10 rows.
    expect(pageOf(10, 7).safe).toBe(0);
    expect(pageOf(10, 7).end).toBe(10);
  });
});

describe('date presets', () => {
  test('the Indian financial year starts on 1 April', () => {
    const fyStart = (n: Date) => {
      const y = n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1;
      return toInputValue(new Date(y, 3, 1));
    };
    expect(fyStart(new Date(2026, 7, 9))).toBe('2026-04-01');  // August → this FY
    expect(fyStart(new Date(2026, 1, 9))).toBe('2025-04-01');  // February → previous FY
  });

  test('last month ends on its true last day', () => {
    const n = new Date(2026, 2, 15); // March
    expect(toInputValue(new Date(n.getFullYear(), n.getMonth(), 0))).toBe('2026-02-28');
  });
});

describe('category filter', () => {
  type E = { kind: 'txn'; categoryId: string } | { kind: 'transfer' };
  const passes = (e: E, categoryFilter: string) => {
    if (categoryFilter === 'all') return true;
    return e.kind === 'txn' && e.categoryId === categoryFilter;
  };

  test('keeps only the chosen category', () => {
    expect(passes({ kind: 'txn', categoryId: 'food' }, 'food')).toBe(true);
    expect(passes({ kind: 'txn', categoryId: 'utilities' }, 'food')).toBe(false);
  });

  test('"all" keeps everything, including transfers', () => {
    expect(passes({ kind: 'transfer' }, 'all')).toBe(true);
    expect(passes({ kind: 'txn', categoryId: 'food' }, 'all')).toBe(true);
  });

  test('a category filter excludes transfers, which have no category', () => {
    // Showing transfers while filtering by "Food" would be pure noise.
    expect(passes({ kind: 'transfer' }, 'food')).toBe(false);
  });

  test('only categories in use are offered, most used first', () => {
    const txns = [
      { categoryId: 'food' }, { categoryId: 'food' }, { categoryId: 'food' },
      { categoryId: 'utilities' },
    ];
    const names = new Map([['food', 'Food'], ['utilities', 'Utilities'], ['rent', 'Rent']]);
    const counts = new Map<string, number>();
    for (const t of txns) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
    const present = [...counts.entries()]
      .map(([id, n]) => ({ name: names.get(id)!, count: n }))
      .sort((a, b) => b.count - a.count);

    expect(present).toEqual([{ name: 'Food', count: 3 }, { name: 'Utilities', count: 1 }]);
    // Rent exists as a category but is unused, so offering it would match nothing.
    expect(present.some((p) => p.name === 'Rent')).toBe(false);
  });
});
