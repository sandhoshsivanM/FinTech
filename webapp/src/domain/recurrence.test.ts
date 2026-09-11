import { describe, test, expect } from 'vitest';
import { advance, materialize } from './recurrence';
import type { RecurringRule } from '@/lib/types';

const d = (iso: string) => new Date(iso).getTime();
const day = (t: number) => new Date(t).getDate();

const rule = (over: Partial<RecurringRule>): RecurringRule => ({
  id: 'r1', vaultId: 'v1', amount: '70000', type: 'income',
  categoryId: 'c1', frequency: 'monthly', nextRun: d('2026-09-07T00:00:00'), ...over,
});

describe('advance', () => {
  // The scheduled day of month is the intent, and it has to survive a late
  // posting. A salary due on the 7th that is paid on the 10th is still a rule
  // about the 7th — stepping from the payment date would move every future
  // occurrence to the 10th permanently.
  test('a late payment does not drag the schedule when stepped from the schedule', () => {
    const scheduled = d('2026-09-07T00:00:00');
    const paidLate = d('2026-09-10T00:00:00');
    expect(day(advance(scheduled, 'monthly'))).toBe(7);
    expect(day(advance(paidLate, 'monthly'))).toBe(10);
  });

  test('monthly clamps into a short month and returns to the intended day', () => {
    const jan31 = d('2026-01-31T00:00:00');
    const feb = advance(jan31, 'monthly');
    expect(day(feb)).toBe(28);
    expect(day(advance(feb, 'monthly'))).toBe(28);
    // Stepping from the original 31st reaches March the 31st, not the 3rd of
    // April — the overflow bug this clamping exists to prevent.
    expect(day(advance(d('2026-03-31T00:00:00'), 'monthly'))).toBe(30);
  });

  test('daily, weekly and yearly step as expected', () => {
    expect(advance(d('2026-09-07T00:00:00'), 'daily')).toBe(d('2026-09-08T00:00:00'));
    expect(advance(d('2026-09-07T00:00:00'), 'weekly')).toBe(d('2026-09-14T00:00:00'));
    expect(advance(d('2026-09-07T00:00:00'), 'yearly')).toBe(d('2027-09-07T00:00:00'));
  });
});

describe('materialize', () => {
  // This is what makes the batch run all-or-nothing, and why posting one rule
  // needed its own path: a rule three days overdue reports one missed run, and
  // running the batch posts that one for EVERY overdue rule at once.
  test('reports the runs a rule has missed', () => {
    const { runs, nextRun } = materialize(rule({}), d('2026-09-10T00:00:00'));
    expect(runs).toEqual([d('2026-09-07T00:00:00')]);
    expect(day(nextRun)).toBe(7);
    expect(new Date(nextRun).getMonth()).toBe(9); // October
  });

  test('catches up several missed periods at once', () => {
    const { runs } = materialize(
      rule({ nextRun: d('2026-06-07T00:00:00') }),
      d('2026-09-10T00:00:00'),
    );
    expect(runs).toHaveLength(4); // Jun, Jul, Aug, Sep
  });

  test('a rule not yet due produces no runs and keeps its date', () => {
    const r = rule({});
    const { runs, nextRun } = materialize(r, d('2026-09-01T00:00:00'));
    expect(runs).toEqual([]);
    expect(nextRun).toBe(r.nextRun);
  });
});
