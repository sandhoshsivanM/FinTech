// Recurring rule scheduling (PRD §14). Pure date math.
import type { Frequency, RecurringRule } from '@/lib/types';

/**
 * Adds one period, clamping to the end of a short month.
 *
 * `setMonth` overflows: 31 January plus one month is 31 February, which the
 * Date object silently resolves to 3 March. A rent rule dated the 31st
 * therefore skipped February altogether and then posted twice in March. Rules
 * dated the 29th, 30th or 31st are common — month-end salaries, EMIs, rent —
 * so this was not an edge case, it was a class of rule that mis-scheduled every
 * year.
 *
 * Clamping is the behaviour people expect from a monthly obligation: the 31st
 * falls on the 28th in February and returns to the 31st in March, because the
 * *intended* day of month is preserved rather than drifting.
 */
function addMonths(d: Date, months: number): void {
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
}

export function advance(from: number, freq: Frequency): number {
  const d = new Date(from);
  switch (freq) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': addMonths(d, 1); break;
    case 'yearly': addMonths(d, 12); break;
  }
  return d.getTime();
}

export const FREQ_LABEL: Record<Frequency, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
};

/** Catch-up: returns the run dates a rule has missed up to `now`, and its new nextRun. */
export function materialize(rule: RecurringRule, now = Date.now()): { runs: number[]; nextRun: number } {
  const runs: number[] = [];
  let next = rule.nextRun;
  let guard = 0;
  while (next <= now && guard < 2000) {
    runs.push(next);
    next = advance(next, rule.frequency);
    guard++;
  }
  return { runs, nextRun: next };
}
