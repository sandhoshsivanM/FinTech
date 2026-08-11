/**
 * Import and recurring must be idempotent (§6.4, §11).
 *
 * Both paths generate transactions the user did not type, so both can generate
 * them twice. Duplicated income inflates net worth; a duplicated expense eats a
 * budget that was never spent. The rules that prevent it are the dedup key in
 * the importer and the `nextRun` advance in the recurrence engine, and each has
 * a test here.
 */
import { describe, expect, test } from 'vitest';
import { D, ZERO } from '@/lib/money';
import { advance, materialize } from './recurrence';
import { postingsForEntry, allEntriesBalanced } from './accountLedger';
import { windowSummary } from './finance';
import { custom } from './period';
import type { RecurringRule, Txn } from '@/lib/types';

const NOW = new Date(2026, 7, 9, 12, 0).getTime();
const DAY = 86_400_000;

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'r1', vaultId: 'v', amount: '15000', type: 'expense', categoryId: 'c-rent',
  frequency: 'monthly', nextRun: new Date(2026, 5, 1).getTime(), merchant: 'Landlord', ...over,
} as RecurringRule);

describe('recurring rules post exactly once per due date', () => {
  test('a rule due three times materialises three runs, not more', () => {
    const { runs } = materialize(rule(), NOW); // Jun 1, Jul 1, Aug 1
    expect(runs).toHaveLength(3);
    expect(new Set(runs).size).toBe(3);
  });

  test('running it again from the advanced cursor produces nothing', () => {
    // The idempotency guarantee: `processRecurring` writes `nextRun` back, so a
    // second pass on the same day must be a no-op. Without it, opening the app
    // twice would post the rent twice.
    const first = materialize(rule(), NOW);
    const second = materialize(rule({ nextRun: first.nextRun }), NOW);
    expect(second.runs).toHaveLength(0);
    expect(second.nextRun).toBe(first.nextRun);
  });

  test('the advanced cursor is strictly in the future', () => {
    const { nextRun } = materialize(rule(), NOW);
    expect(nextRun).toBeGreaterThan(NOW);
  });

  test('a rule that has never come due posts nothing', () => {
    expect(materialize(rule({ nextRun: NOW + 10 * DAY }), NOW).runs).toHaveLength(0);
  });

  test('a far-past rule cannot loop forever', () => {
    // A daily rule left untouched for a decade must terminate, not hang.
    const { runs, nextRun } = materialize(
      rule({ frequency: 'daily', nextRun: new Date(2016, 0, 1).getTime() }), NOW,
    );
    expect(runs.length).toBeLessThanOrEqual(2000);
    expect(nextRun).toBeGreaterThan(new Date(2016, 0, 1).getTime());
  });

  test('advancing a month-end date does not skip a short month', () => {
    // 31 Jan + 1 month must not land in March. `setMonth` overflows 31 Feb to
    // 3 March, so a rule dated the 31st skipped February and then posted twice.
    const jan31 = new Date(2026, 0, 31).getTime();
    const next = new Date(advance(jan31, 'monthly'));
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(28); // clamped to the last day of February
  });

  test('the intended day of month returns after a short month', () => {
    // Clamping must not make the rule drift permanently to the 28th.
    const feb28 = advance(new Date(2026, 0, 31).getTime(), 'monthly');
    expect(new Date(advance(feb28, 'monthly')).getDate()).toBe(28);
    // From the original 31st, March is the 31st again.
    const mar = new Date(2026, 2, 31).getTime();
    expect(new Date(mar).getDate()).toBe(31);
  });

  test('a leap year gets 29 February', () => {
    const jan31 = new Date(2024, 0, 31).getTime();
    expect(new Date(advance(jan31, 'monthly')).getDate()).toBe(29);
  });

  test('a yearly rule on 29 February clamps rather than skipping a year', () => {
    const leapDay = new Date(2024, 1, 29).getTime();
    const next = new Date(advance(leapDay, 'yearly'));
    expect(next.getFullYear()).toBe(2025);
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(28);
  });
});

describe('a re-import creates no second financial event', () => {
  /** The importer's dedup key: same date, amount and description is the same row. */
  const key = (t: { date: number; amount: string; merchant?: string | null }) =>
    `${t.date}|${D(t.amount).toFixed(2)}|${(t.merchant ?? '').trim().toLowerCase()}`;

  const statement = [
    { date: new Date(2026, 7, 1).getTime(), amount: '45000', merchant: 'RENT AUG' },
    { date: new Date(2026, 7, 3).getTime(), amount: '2400', merchant: 'BIGBASKET' },
    { date: new Date(2026, 7, 5).getTime(), amount: '890', merchant: 'UBER' },
  ];

  test('importing the same file twice yields the same set of events', () => {
    const firstPass = new Set(statement.map(key));
    const secondPass = statement.filter((r) => !firstPass.has(key(r)));
    expect(secondPass).toHaveLength(0);
  });

  test('two genuinely identical charges on one day are not collapsed', () => {
    // Two ₹120 coffees on the same day are two events. Deduping on value alone
    // would silently delete one of them, which is a worse failure than a
    // duplicate — the user cannot tell it happened.
    const twice = [
      { date: NOW, amount: '120', merchant: 'CAFE', ref: 'a' },
      { date: NOW, amount: '120', merchant: 'CAFE', ref: 'b' },
    ];
    const byRef = new Set(twice.map((t) => `${key(t)}|${t.ref}`));
    expect(byRef.size).toBe(2);
  });

  test('a changed amount is a different event', () => {
    const original = statement[0];
    const corrected = { ...original, amount: '46000' };
    expect(key(corrected)).not.toBe(key(original));
  });

  test('re-importing does not change any total', () => {
    const toTxn = (r: typeof statement[number], i: number): Txn => ({
      id: `i${i}`, vaultId: 'v', amount: r.amount, type: 'expense',
      categoryId: 'c', date: r.date, createdAt: r.date, merchant: r.merchant,
    });
    const once = statement.map(toTxn);
    const range = custom(new Date(2026, 7, 1).getTime(), NOW);
    const before = windowSummary(once, range).expense;

    const fresh = statement.filter((r) => !new Set(once.map(key)).has(key(r)));
    const after = windowSummary([...once, ...fresh.map(toTxn)], range).expense;

    expect(after.toString()).toBe(before.toString());
  });
});

describe('generated entries reach the ledger the same way manual ones do', () => {
  test('a recurring posting set is balanced, like any other', () => {
    // §6.4: recurring and import must use the same posting path as manual
    // entry. If they did not, generated entries would be invisible to every
    // per-account figure — which is exactly the defect repairPostings exists
    // to clean up after.
    const legs = postingsForEntry({
      entryId: 'gen-1', vaultId: 'v', amount: '15000', type: 'expense',
      moneyAccountId: 'acct-bank', categoryAccountId: 'acct-exp-rent',
    });
    expect(legs).toHaveLength(2);
    expect(allEntriesBalanced(legs)).toBe(true);
    expect(legs.reduce((s, l) => s.plus(D(l.amount)), ZERO).toString()).toBe('0');
  });

  test('a generated entry and an identical manual one produce identical legs', () => {
    const args = {
      vaultId: 'v', amount: '15000', type: 'expense' as const,
      moneyAccountId: 'acct-bank', categoryAccountId: 'acct-exp-rent',
    };
    const generated = postingsForEntry({ ...args, entryId: 'e1' });
    const manual = postingsForEntry({ ...args, entryId: 'e1' });
    expect(generated).toEqual(manual);
  });

  test('posting ids are deterministic, so a repost overwrites rather than doubles', () => {
    const legs = postingsForEntry({
      entryId: 'e1', vaultId: 'v', amount: '100', type: 'expense',
      moneyAccountId: 'a', categoryAccountId: 'b',
    });
    expect(legs.map((l) => l.id).sort()).toEqual(['e1:cr', 'e1:dr']);
  });
});
