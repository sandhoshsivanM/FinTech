// Target vs actual asset allocation.
//
// Mirrors packages/khazana_domain/lib/services/allocation_targets.dart. Both
// suites assert against test/fixtures/allocation_cases.json (copied to
// webapp/src/domain/__fixtures__/); change one twin, change the other.
//
// The output only ever SUGGESTS where new money should go. "Over by ₹X" is
// deliberately not "Sell ₹X": a sale has tax and exit-load consequences this
// screen cannot see.
import Decimal from 'decimal.js';
import { D, ZERO } from './money';
import { ASSET_GROUP_META, ASSET_GROUP_OF, ASSET_GROUP_ORDER, type AssetGroup } from './portfolio';
import type { AssetType } from './types';

/** Default band, in percentage points, inside which a group reads "On track". */
export const DEFAULT_ALLOCATION_TOLERANCE = 2;

export type AllocationTargets = Partial<Record<AssetGroup, number>>;

/**
 * The stored targets: one record per profile (`STORE.allocationTarget`), keyed
 * by `allocationTargetId(profileId)` so a save always replaces, never adds.
 */
export interface AllocationTargetRecord {
  id: string;
  vaultId: string;
  profileId?: string;
  targets: AllocationTargets;
  /** Points either side of target that still read "On track". */
  tolerance: number;
  updatedAt: number;
}

export const allocationTargetId = (profileId: string): string => `alloc:${profileId}`;

export interface AllocationInput {
  type: AssetType;
  /** Current market value, a Decimal string. */
  value: Decimal.Value;
}

export type AllocationStatus = 'under' | 'over' | 'on_track';

export interface AllocationChild {
  type: AssetType;
  value: Decimal;
  /** Share of the whole portfolio, 1 dp. */
  actualPct: Decimal;
  count: number;
}

export interface AllocationRow {
  group: AssetGroup;
  value: Decimal;
  actualPct: Decimal;
  targetPct: number;
  targetValue: Decimal;
  /** actual − target in points, 1 dp. Negative = under target. */
  gapPct: Decimal;
  status: AllocationStatus;
  /** Rupees to reach (under) or above (over) target. Zero when on track. */
  amount: Decimal;
  children: AllocationChild[];
}

export interface AllocationReport {
  total: Decimal;
  rows: AllocationRow[];
  targetsTotal: number;
  hasTargets: boolean;
}

const HUNDRED = new Decimal(100);

const pct = (part: Decimal, total: Decimal): Decimal =>
  total.isZero() ? ZERO : part.times(HUNDRED).div(total);

/** Half-up (away from zero), matching Dart's Decimal.round. */
export const roundHalfUp = (v: Decimal, scale = 0): Decimal =>
  v.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);

const typeOrder = (t: AssetType): number => TYPE_INDEX.indexOf(t);
// Dart's AssetType declaration order, used only to break ties between
// equal-valued children so both twins list them identically.
const TYPE_INDEX: AssetType[] = [
  'equity_etf', 'equity_mf', 'debt_mf', 'gold_etf', 'bond', 'cash', 'real_estate',
  'crypto', 'fd', 'ppf_epf', 'nps', 'ssy', 'sgb', 'ulip', 'digital_gold', 'silver',
  'foreign_equity',
];

export function groupLabel(g: AssetGroup): string {
  return ASSET_GROUP_META[g].label;
}

export function targetVsActual(
  holdings: AllocationInput[],
  targets: AllocationTargets,
  tolerance: number = DEFAULT_ALLOCATION_TOLERANCE,
): AllocationReport {
  const tol = new Decimal(tolerance);
  let total = ZERO;
  const byGroup = new Map<AssetGroup, Map<AssetType, { value: Decimal; count: number }>>();
  for (const h of holdings) {
    const v = D(h.value);
    if (v.lte(0)) continue;
    total = total.plus(v);
    const g = ASSET_GROUP_OF[h.type];
    const types = byGroup.get(g) ?? new Map();
    byGroup.set(g, types);
    const prev = types.get(h.type) ?? { value: ZERO, count: 0 };
    types.set(h.type, { value: prev.value.plus(v), count: prev.count + 1 });
  }

  const rows: AllocationRow[] = [];
  for (const g of ASSET_GROUP_ORDER) {
    const types = byGroup.get(g) ?? new Map<AssetType, { value: Decimal; count: number }>();
    const target = targets[g] ?? 0;
    if (types.size === 0 && target === 0) continue;

    let value = ZERO;
    for (const t of types.values()) value = value.plus(t.value);
    const exact = pct(value, total);
    const gap = exact.minus(target);
    const targetValue = roundHalfUp(total.times(target).div(HUNDRED));
    const status: AllocationStatus = gap.lt(tol.neg()) ? 'under' : gap.gt(tol) ? 'over' : 'on_track';

    const children: AllocationChild[] = [...types.entries()]
      .map(([type, t]) => ({ type, value: t.value, actualPct: roundHalfUp(pct(t.value, total), 1), count: t.count }))
      .sort((a, b) => b.value.comparedTo(a.value) || typeOrder(a.type) - typeOrder(b.type));

    rows.push({
      group: g,
      value,
      actualPct: roundHalfUp(exact, 1),
      targetPct: target,
      targetValue,
      gapPct: roundHalfUp(gap, 1),
      status,
      amount: status === 'on_track' ? ZERO : roundHalfUp(targetValue.minus(value).abs()),
      children,
    });
  }

  const targetsTotal = Object.values(targets).reduce<number>((a, b) => a + (b ?? 0), 0);
  return { total, rows, targetsTotal, hasTargets: targetsTotal === 100 };
}

/** Why a set of targets cannot be saved, or null when it can. */
export function validateTargets(targets: AllocationTargets): string | null {
  for (const [g, v] of Object.entries(targets) as [AssetGroup, number][]) {
    if (v < 0 || v > 100) return `${groupLabel(g)} must be between 0% and 100%`;
  }
  const sum = Object.values(targets).reduce<number>((a, b) => a + (b ?? 0), 0);
  if (sum !== 100) return `Targets add up to ${sum}%. They must total 100%.`;
  return null;
}

/**
 * A first-time starting point: today's allocation in whole percents totalling
 * exactly 100. The rounding remainder goes to the largest group.
 */
export function suggestTargets(report: AllocationReport): AllocationTargets {
  if (report.total.isZero()) return {};
  const out: AllocationTargets = {};
  let largest: AllocationRow | null = null;
  for (const r of report.rows) {
    if (r.value.isZero()) continue;
    out[r.group] = roundHalfUp(pct(r.value, report.total)).toNumber();
    if (!largest || r.value.gt(largest.value)) largest = r;
  }
  const diff = 100 - Object.values(out).reduce<number>((a, b) => a + (b ?? 0), 0);
  if (largest && diff !== 0) out[largest.group] = (out[largest.group] ?? 0) + diff;
  return out;
}
