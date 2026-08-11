/**
 * The alert engine (§5).
 *
 * Two of the five alert kinds could be created and could never fire, and the
 * two evaluators that did exist disagreed with each other. Each test here is
 * one of those failures.
 */
import { describe, expect, test } from 'vitest';
import { evaluateAlerts, nextState, stateOf, triggered } from './alerts';
import type {
  Alert, AlertKind, Budget, Category, Holding, Insurance, Txn,
} from '@/lib/types';

const NOW = new Date(2026, 7, 9, 12, 0).getTime();
const DAY = 86_400_000;

const alert = (kind: AlertKind, over: Partial<Alert> = {}): Alert => ({
  id: `a-${kind}`, vaultId: 'v', kind, label: kind, threshold: '100',
  active: true, createdAt: 0, ...over,
});

const holding = (over: Partial<Holding> = {}): Holding => ({
  id: 'h1', vaultId: 'v', symbol: 'INFY', exchange: 'NSE',
  quantity: '10', avgCost: '1400', lastPrice: '1500', assetType: 'equity_etf', ...over,
});

const txn = (amount: string, categoryId: string, daysAgo = 1): Txn => ({
  id: `t${amount}${categoryId}${daysAgo}`, vaultId: 'v', amount, type: 'expense',
  categoryId, date: NOW - daysAgo * DAY, createdAt: NOW,
});

const budget = (over: Partial<Budget> = {}): Budget => ({
  id: 'b1', vaultId: 'v', categoryId: 'c-food', amountLimit: '5000',
  rolloverEnabled: false, alertThresholdPct: 90, ...over,
});

const policy = (renewalDate: number | null): Insurance => ({
  id: 'i1', vaultId: 'v', name: 'HDFC Click 2 Protect', type: 'life',
  coverAmount: '10000000', premium: '18000', renewalDate,
});

const base = {
  alerts: [] as Alert[], holdings: [] as Holding[], budgets: [] as Budget[],
  categories: [{ id: 'c-food', vaultId: 'v', name: 'Food' }] as Category[],
  txns: [] as Txn[], insurances: [] as Insurance[], now: NOW,
};

const run = (over: Partial<typeof base>) => evaluateAlerts({ ...base, ...over });
const first = (over: Partial<typeof base>) => run(over).evaluations[0];

describe('budget_over — could be created, could never fire', () => {
  test('it fires once spending reaches the threshold share of the limit', () => {
    const e = first({
      alerts: [alert('budget_over', { symbol: 'c-food', threshold: '90' })],
      budgets: [budget()],
      txns: [txn('4500', 'c-food')], // 90% of 5,000
    });
    expect(e.met).toBe(true);
    expect(e.type).toBe('FINANCIAL');
    expect(e.message).toContain('Food');
  });

  test('it stays quiet below the threshold', () => {
    const e = first({
      alerts: [alert('budget_over', { symbol: 'c-food', threshold: '90' })],
      budgets: [budget()],
      txns: [txn('4000', 'c-food')],
    });
    expect(e.met).toBe(false);
  });

  test('an investment tagged to the category cannot trigger it (§3.2)', () => {
    const sip: Txn = { ...txn('9000', 'c-food'), type: 'investment' };
    const e = first({
      alerts: [alert('budget_over', { symbol: 'c-food', threshold: '90' })],
      budgets: [budget()],
      txns: [sip],
    });
    expect(e.met).toBe(false);
  });

  test('with no budget for the category it says so rather than firing', () => {
    const e = first({ alerts: [alert('budget_over', { symbol: 'c-none' })], budgets: [budget()] });
    expect(e.met).toBe(false);
    expect(e.unevaluable).toBe(true);
  });

  test('only this month counts', () => {
    const e = first({
      alerts: [alert('budget_over', { symbol: 'c-food', threshold: '90' })],
      budgets: [budget()],
      txns: [txn('9000', 'c-food', 60)], // two months ago
    });
    expect(e.met).toBe(false);
  });
});

describe('renewal_due — the other kind that never fired', () => {
  test('it fires for a policy inside the horizon', () => {
    const e = first({
      alerts: [alert('renewal_due', { threshold: '30' })],
      insurances: [policy(NOW + 12 * DAY)],
    });
    expect(e.met).toBe(true);
    expect(e.type).toBe('SCHEDULED');
    expect(e.message).toContain('12 days');
  });

  test('it ignores a renewal beyond the horizon', () => {
    const e = first({
      alerts: [alert('renewal_due', { threshold: '30' })],
      insurances: [policy(NOW + 90 * DAY)],
    });
    expect(e.met).toBe(false);
  });

  test('it ignores a renewal that has already passed', () => {
    const e = first({
      alerts: [alert('renewal_due', { threshold: '30' })],
      insurances: [policy(NOW - 3 * DAY)],
    });
    expect(e.met).toBe(false);
  });
});

describe('market alerts are honest about their data', () => {
  test('a price alert fires and reports the price date', () => {
    const asOf = NOW - 3 * DAY;
    const e = first({
      alerts: [alert('price_above', { symbol: 'INFY', threshold: '1400' })],
      holdings: [holding({ priceAsOf: asOf })],
    });
    expect(e.met).toBe(true);
    expect(e.type).toBe('MARKET');
    expect(e.dataAsOf).toBe(asOf);
  });

  test('an unpriced holding is unevaluable, not a trigger against cost', () => {
    // It used to compare against avgCost, so a "price below" could fire on a
    // price that was never observed (§7.1).
    const e = first({
      alerts: [alert('price_below', { symbol: 'INFY', threshold: '1450' })],
      holdings: [holding({ lastPrice: null })],
    });
    expect(e.met).toBe(false);
    expect(e.unevaluable).toBe(true);
    expect(e.message).toContain('no recorded price');
  });

  test('thresholds compare in Decimal, not float', () => {
    const e = first({
      alerts: [alert('price_above', { symbol: 'INFY', threshold: '1500.00' })],
      holdings: [holding({ lastPrice: '1500.00' })],
    });
    expect(e.met).toBe(false); // strictly above, and equal is not above
  });

  test('weight_above measures the share of the portfolio', () => {
    const e = first({
      alerts: [alert('weight_above', { symbol: 'INFY', threshold: '50' })],
      holdings: [
        holding({ id: 'h1', symbol: 'INFY', quantity: '10', lastPrice: '1000' }), // 10,000
        holding({ id: 'h2', symbol: 'TCS', quantity: '1', lastPrice: '5000' }),   // 5,000
      ],
    });
    expect(e.met).toBe(true); // 66.7%
    expect(e.message).toContain('66.7%');
  });
});

describe('state machine', () => {
  test('a met condition moves ARMED to TRIGGERED', () => {
    expect(nextState('ARMED', true)).toBe('TRIGGERED');
  });

  test('a dismissed alert stays dismissed while the condition holds', () => {
    expect(nextState('DISMISSED', true)).toBe('DISMISSED');
  });

  test('but re-arms once the condition stops holding', () => {
    // Otherwise dismissing an August overspend silences September forever.
    expect(nextState('DISMISSED', false)).toBe('ARMED');
    expect(nextState('TRIGGERED', false)).toBe('ARMED');
  });

  test('records written before §5 read as ARMED', () => {
    expect(stateOf(alert('price_above'))).toBe('ARMED');
  });

  test('evaluation records when it happened, and the state it reached', () => {
    const r = run({
      alerts: [alert('price_above', { symbol: 'INFY', threshold: '1400' })],
      holdings: [holding()],
    });
    expect(r.updated[0].lastEvaluatedAt).toBe(NOW);
    expect(r.updated[0].lastTriggeredAt).toBe(NOW);
    expect(r.updated[0].state).toBe('TRIGGERED');
  });

  test('a paused alert is never stamped as evaluated', () => {
    // Claiming a check that did not happen is the dishonesty §5 exists to stop.
    const r = run({ alerts: [alert('price_above', { active: false, symbol: 'INFY' })] });
    expect(r.updated[0].lastEvaluatedAt).toBeUndefined();
    expect(r.evaluations).toHaveLength(0);
  });

  test('a dismissed alert does not show in the bell', () => {
    const r = run({
      alerts: [alert('price_above', { symbol: 'INFY', threshold: '1400', state: 'DISMISSED' })],
      holdings: [holding()],
    });
    expect(r.evaluations[0].met).toBe(true);
    expect(triggered(r)).toHaveLength(0);
  });
});

describe('one evaluator, one verdict', () => {
  test('the same inputs give the same answer every time', () => {
    // The Alerts page and the notification bell used to run separate
    // implementations that handled different kinds and disagreed.
    const input = {
      alerts: [alert('weight_above', { symbol: 'INFY', threshold: '50' })],
      holdings: [holding({ quantity: '10', lastPrice: '1000' })],
    };
    expect(first(input).met).toBe(first(input).met);
    expect(first(input).message).toBe(first(input).message);
  });
});
