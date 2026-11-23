// Twin of test/unit/allocation_targets_test.dart. Both run the cases in
// __fixtures__/allocation_cases.json, a byte-identical copy of
// test/fixtures/allocation_cases.json (the Dart suite checks the copy).
import { describe, expect, test } from 'vitest';
import { suggestTargets, targetVsActual, validateTargets, type AllocationTargets } from '@khazana/domain/allocation';
import type { AssetType } from '@khazana/domain/types';
import { ASSET_GROUP_META, ASSET_GROUP_OF } from '@khazana/domain/portfolio';
import fixture from './__fixtures__/allocation_cases.json';

interface Case {
  name: string;
  holdings: { type: AssetType; value: string }[];
  targets: AllocationTargets;
  tolerance?: number;
  expect: { total: string; targetsTotal: number; hasTargets: boolean; suggested: AllocationTargets; rows: unknown[] };
}

describe('allocation fixture', () => {
  for (const c of fixture.cases as unknown as Case[]) {
    test(c.name, () => {
      const r = targetVsActual(c.holdings, c.targets, c.tolerance ?? 2);
      const e = c.expect;
      expect(r.total.toFixed()).toBe(e.total);
      expect(r.targetsTotal).toBe(e.targetsTotal);
      expect(r.hasTargets).toBe(e.hasTargets);
      expect(suggestTargets(r)).toEqual(e.suggested);
      expect(r.rows.map((x) => ({
        group: x.group, value: x.value.toFixed(), actualPct: x.actualPct.toFixed(), targetPct: x.targetPct,
        targetValue: x.targetValue.toFixed(), gapPct: x.gapPct.toFixed(), status: x.status, amount: x.amount.toFixed(),
        children: x.children.map((k) => ({ type: k.type, value: k.value.toFixed(), actualPct: k.actualPct.toFixed(), count: k.count })),
      }))).toEqual(e.rows);
    });
  }
});

describe('validateTargets', () => {
  test('accepts targets totalling 100', () => {
    expect(validateTargets({ equity: 70, debt: 30 })).toBeNull();
  });
  test('names the total when it is not 100', () => {
    expect(validateTargets({ equity: 70, debt: 20 })).toBe('Targets add up to 90%. They must total 100%.');
  });
  test('rejects a negative target', () => {
    expect(validateTargets({ equity: 110, debt: -10 })).not.toBeNull();
  });
});

test('digital gold and silver sit in the Gold & commodities group', () => {
  expect(ASSET_GROUP_OF.digital_gold).toBe('gold');
  expect(ASSET_GROUP_OF.silver).toBe('gold');
  expect(ASSET_GROUP_META.gold.label).toBe('Gold & commodities');
});
