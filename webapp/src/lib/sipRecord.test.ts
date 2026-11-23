import { describe, expect, test } from 'vitest';
import { markDone, skip, undo, isoToMs } from '@khazana/screens/lib/sipRecord';
import { STORE, type Holding, type HoldingLot } from '@khazana/domain/types';
import type { SipPlan } from '@khazana/domain/sip';

const plan: SipPlan = {
  id: 'sip', vaultId: 'v', holdingId: 'h', name: 'Flexi Cap', assetType: 'equity_mf', amount: '5000',
  dayOfMonth: 5, startDate: '2026-01-05', stepUpPct: 0, remind: true, active: true, createdAt: 0,
};
const holding = (over: Partial<Holding> = {}): Holding => ({
  id: 'h', vaultId: 'v', symbol: 'FLEXI', exchange: 'NSE', quantity: '100', avgCost: '50', assetType: 'equity_mf',
  firstPurchaseDate: isoToMs('2025-06-01'), ...over,
});
let n = 0;
const newId = () => `id${n++}`;
const run = (h: Holding, lots: HoldingLot[] = [], amount = '5000', nav = '100') =>
  markDone({ plan, holding: h, lots, dueDate: '2026-11-05', amount, nav, now: 1, newId });

describe('markDone', () => {
  test('units at the NAV, weighted average cost, no lot beside an average-only holding', () => {
    const r = run(holding());
    expect(r.units.toString()).toBe('50');
    expect(r.holding.quantity).toBe('150');
    // (100 × 50 + 50 × 100) / 150
    expect(r.holding.avgCost).toBe('66.666667');
    expect(r.lot).toBeNull();
    expect(r.instalment).toMatchObject({ status: 'done', amount: '5000', units: '50', nav: '100', lotId: null });
    expect(r.instalment.holdingBefore).toMatchObject({ quantity: '100', avgCost: '50' });
    expect(r.entries.map((e) => e.type)).toEqual([STORE.holding, STORE.sipInstalment]);
  });

  test('a holding that keeps lots gets a lot for the instalment', () => {
    const lots: HoldingLot[] = [{ id: 'l0', vaultId: 'v', holdingId: 'h', quantity: '100', costPerUnit: '50', purchaseDate: 0 }];
    const r = run(holding(), lots);
    expect(r.lot).toMatchObject({ holdingId: 'h', quantity: '50', costPerUnit: '100', purchaseDate: isoToMs('2026-11-05') });
    expect(r.instalment.lotId).toBe(r.lot!.id);
  });

  test('an empty holding starts with this lot and this date', () => {
    const r = run(holding({ quantity: '0', avgCost: '0', firstPurchaseDate: null }));
    expect(r.holding).toMatchObject({ quantity: '50', avgCost: '100', firstPurchaseDate: isoToMs('2026-11-05'), lastPrice: '100' });
    expect(r.lot).not.toBeNull();
  });

  test('units round to 3 decimals', () => {
    expect(run(holding(), [], '5000', '96.42').units.toString()).toBe('51.856');
  });

  test('a zero or missing NAV is refused', () => {
    expect(() => run(holding(), [], '5000', '0')).toThrow();
  });
});

describe('undo', () => {
  test('puts the holding back exactly and removes the lot', () => {
    const lots: HoldingLot[] = [{ id: 'l0', vaultId: 'v', holdingId: 'h', quantity: '100', costPerUnit: '50', purchaseDate: 0 }];
    const r = run(holding(), lots);
    const u = undo(r.instalment, r.holding);
    expect(u.holding).toMatchObject({ quantity: '100', avgCost: '50', firstPurchaseDate: isoToMs('2025-06-01') });
    expect(u.deletes).toEqual([{ type: STORE.lot, id: r.lot!.id }, { type: STORE.sipInstalment, id: r.instalment.id }]);
  });

  test('after the holding moved, takes off just these units at their NAV', () => {
    const r = run(holding());
    // Another 50 units at 66.666667 were added by hand since.
    const moved = { ...r.holding, quantity: '200', avgCost: '66.666667' };
    const u = undo(r.instalment, moved);
    expect(u.holding!.quantity).toBe('150');
    // (200 × 66.666667 − 50 × 100) / 150
    expect(u.holding!.avgCost).toBe('55.555556');
  });

  test('a skipped month only loses its answer', () => {
    const s = skip(plan, '2026-11-05', 1, 'sk');
    expect(s).toMatchObject({ status: 'skipped', amount: '0' });
    expect(undo(s, holding())).toEqual({ holding: null, deletes: [{ type: STORE.sipInstalment, id: 'sk' }] });
  });
});
