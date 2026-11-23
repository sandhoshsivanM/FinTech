// Twin of test/unit/sip_schedule_test.dart. Both run __fixtures__/sip_cases.json.
import { describe, expect, test } from 'vitest';
import * as sip from '@khazana/domain/sip';
import type { SipInstalment, SipPlan } from '@khazana/domain/sip';
import fixture from './__fixtures__/sip_cases.json';

const plans: SipPlan[] = fixture.plans.map((p) => ({
  ...p, vaultId: 'v', holdingId: p.id, name: p.id, remind: true, createdAt: 0,
}) as SipPlan);
const inst: SipInstalment[] = fixture.instalments.map((i, n) => ({
  ...i, id: `i${n}`, vaultId: 'v', decidedAt: 0,
}) as SipInstalment);

interface Query {
  fn: string; plan: string; from: string; to: string; on: string; today: string;
  amount: string; nav: string; gap: string; monthly: string; expect: unknown;
}
const P = (id: string) => plans.find((p) => p.id === id)!;

describe('sip fixture', () => {
  for (const q of fixture.queries as unknown as Query[]) {
    test(`${q.fn} ${q.plan ?? ''} ${q.today ?? q.on ?? q.from ?? q.amount ?? q.gap ?? ''}`, () => {
      switch (q.fn) {
        case 'occurrences': return expect(sip.occurrences(P(q.plan), q.from, q.to)).toEqual(q.expect);
        case 'amountOn': return expect(sip.amountOn(P(q.plan), q.on).toFixed()).toBe(q.expect);
        case 'pendingDue': return expect(sip.pendingDue(P(q.plan), inst, q.today)).toEqual(q.expect);
        case 'nextDue': return expect(sip.nextDue(P(q.plan), q.today)).toBe(q.expect);
        case 'monthlyTotal': return expect(sip.monthlyTotal(plans, q.today).toFixed()).toBe(q.expect);
        case 'investedThisFy': return expect(sip.investedThisFy(inst, q.today).toFixed()).toBe(q.expect);
        case 'unitsFor': return expect(sip.unitsFor(q.amount, q.nav).toFixed()).toBe(q.expect);
        case 'monthsToClose': return expect(sip.monthsToClose(q.gap, q.monthly)).toBe(q.expect);
        case 'sipMix': {
          const mix = sip.sipMix(plans, fixture.targets, q.today);
          const want = q.expect as { rows: unknown[]; warning: string | null };
          expect(mix.map((r) => ({ group: r.group, amount: r.amount.toFixed(), sipPct: r.sipPct, targetPct: r.targetPct })))
            .toEqual(want.rows);
          return expect(sip.sipMixWarning(mix)?.group ?? null).toBe(want.warning);
        }
        default: throw new Error(`unknown fn ${q.fn}`);
      }
    });
  }
});

test('a NAV of zero is refused rather than dividing by it', () => {
  expect(() => sip.unitsFor('100', '0')).toThrow();
});

test('ISO date helpers', () => {
  expect(sip.addDays('2026-03-01', -1)).toBe('2026-02-28');
  expect(sip.fyStart('2027-02-10')).toBe('2026-04-01');
});
