/**
 * What Mark done, Skipped and Undo write. Pure: returns the records, the page
 * hands them to the store.
 *
 * Khazana never moves money. These only record what the user says already
 * happened at their bank or broker.
 *
 * Lots: a holding with no recorded lots is valued from its average (see
 * domain/lots.ts). Writing a single SIP lot beside that average would make the
 * lots describe one month's units and nothing else, and Diagnostics would flag
 * the position as out of step. So a lot is written only when the holding
 * already keeps lots, or is empty (then the lot is the whole truth). Either
 * way the holding's quantity and average cost move, and the instalment keeps
 * the holding's previous figures so Undo restores them exactly.
 */
import Decimal from 'decimal.js';
import { D } from '@khazana/domain/money';
import { STORE, type Holding, type HoldingLot } from '@khazana/domain/types';
import { hasRealLots } from '@khazana/domain/lots';
import { parseIso, unitsFor, type IsoDate, type SipInstalment, type SipPlan } from '@khazana/domain/sip';

export type Entry = { type: string; value: { id: string } & Record<string, unknown> };

/** Local midday on a calendar date, as epoch ms. Midday keeps it on the same day in every zone the app runs in. */
export function isoToMs(iso: IsoDate): number {
  const { y, m, d } = parseIso(iso);
  return new Date(y, m - 1, d, 12).getTime();
}

export interface MarkDoneInput {
  plan: SipPlan;
  holding: Holding;
  lots: HoldingLot[];
  dueDate: IsoDate;
  amount: Decimal.Value;
  nav: Decimal.Value;
  now: number;
  newId: () => string;
}

export interface MarkDoneResult {
  entries: Entry[];
  instalment: SipInstalment;
  units: Decimal;
  holding: Holding;
  lot: HoldingLot | null;
}

const asEntry = (type: string, value: object): Entry => ({ type, value: value as Entry['value'] });

export function markDone(i: MarkDoneInput): MarkDoneResult {
  const amount = D(i.amount);
  const nav = D(i.nav);
  if (amount.lte(0)) throw new RangeError('Amount must be more than zero');
  const units = unitsFor(amount, nav);
  if (units.lte(0)) throw new RangeError('That amount buys no units at this NAV');

  const h = i.holding;
  const q0 = D(h.quantity);
  const a0 = D(h.avgCost);
  const q1 = q0.plus(units);
  const a1 = q0.times(a0).plus(units.times(nav)).div(q1);
  const dueMs = isoToMs(i.dueDate);
  const first = h.firstPurchaseDate && !q0.isZero() ? Math.min(h.firstPurchaseDate, dueMs) : dueMs;

  const holding: Holding = {
    ...h,
    quantity: q1.toString(),
    avgCost: a1.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toString(),
    firstPurchaseDate: first,
    // A NAV the user just confirmed is a better price than none at all.
    ...(h.lastPrice ? {} : { lastPrice: nav.toString() }),
  };

  const writeLot = q0.isZero() || hasRealLots(h, i.lots);
  const lot: HoldingLot | null = writeLot
    ? {
        id: i.newId(), vaultId: h.vaultId, profileId: h.profileId, holdingId: h.id,
        quantity: units.toString(), costPerUnit: nav.toString(), purchaseDate: dueMs,
        note: `SIP: ${i.plan.name}`,
      }
    : null;

  const instalment: SipInstalment = {
    id: i.newId(), vaultId: i.plan.vaultId, profileId: i.plan.profileId, sipId: i.plan.id,
    dueDate: i.dueDate, status: 'done', amount: amount.toString(),
    units: units.toString(), nav: nav.toString(), lotId: lot?.id ?? null,
    holdingBefore: { quantity: h.quantity, avgCost: h.avgCost, firstPurchaseDate: h.firstPurchaseDate ?? null },
    decidedAt: i.now,
  };

  const entries = [asEntry(STORE.holding, holding), asEntry(STORE.sipInstalment, instalment)];
  if (lot) entries.push(asEntry(STORE.lot, lot));
  return { entries, instalment, units, holding, lot };
}

export function skip(plan: SipPlan, dueDate: IsoDate, now: number, id: string): SipInstalment {
  return {
    id, vaultId: plan.vaultId, profileId: plan.profileId, sipId: plan.id, dueDate,
    status: 'skipped', amount: '0', units: null, nav: null, lotId: null, holdingBefore: null, decidedAt: now,
  };
}

export interface UndoResult {
  /** The holding to write back, or null when nothing on it changes. */
  holding: Holding | null;
  /** Records to delete, instalment last. */
  deletes: { type: string; id: string }[];
}

/**
 * Reverses one instalment. A skipped month only loses its answer. A done month
 * gives back its units: exactly the previous figures when the holding has not
 * moved since, otherwise the units come off at the NAV they went on at.
 */
export function undo(inst: SipInstalment, holding: Holding | undefined): UndoResult {
  const deletes: { type: string; id: string }[] = [];
  if (inst.lotId) deletes.push({ type: STORE.lot, id: inst.lotId });
  deletes.push({ type: STORE.sipInstalment, id: inst.id });
  if (inst.status !== 'done' || !holding || !inst.units || !inst.nav) return { holding: null, deletes };

  const units = D(inst.units);
  const nav = D(inst.nav);
  const before = inst.holdingBefore;
  if (before) {
    const q0 = D(before.quantity);
    const q1 = q0.plus(units);
    const a1 = q0.times(D(before.avgCost)).plus(units.times(nav)).div(q1).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
    if (D(holding.quantity).eq(q1) && D(holding.avgCost).eq(a1)) {
      return {
        holding: { ...holding, quantity: before.quantity, avgCost: before.avgCost, firstPurchaseDate: before.firstPurchaseDate ?? null },
        deletes,
      };
    }
  }
  const q = D(holding.quantity).minus(units);
  if (q.lte(0)) return { holding: { ...holding, quantity: '0' }, deletes };
  const avg = D(holding.quantity).times(D(holding.avgCost)).minus(units.times(nav)).div(q);
  return {
    holding: { ...holding, quantity: q.toString(), avgCost: Decimal.max(avg, 0).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toString() },
    deletes,
  };
}
