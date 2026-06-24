// Recurring rule scheduling (PRD §14). Pure date math.
import type { Frequency, RecurringRule } from '@/lib/types';

export function advance(from: number, freq: Frequency): number {
  const d = new Date(from);
  switch (freq) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
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
