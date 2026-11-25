// Twin of test/unit/asset_hints_test.dart. Both run the cases in
// __fixtures__/asset_hint_cases.json, a byte-identical copy of
// test/fixtures/asset_hint_cases.json (the Dart suite checks the copy).
import { describe, expect, test } from 'vitest';
import { misfiledAs, suggestAssetType } from '@khazana/domain/assetHints';
import type { AssetType } from '@khazana/domain/types';
import fixture from './__fixtures__/asset_hint_cases.json';

describe('suggestAssetType', () => {
  for (const c of fixture.cases) {
    test(c.name, () => expect(suggestAssetType(c.symbol, c.title)).toBe(c.expect));
  }
});

describe('misfiledAs', () => {
  for (const c of fixture.misfiled) {
    test(c.name, () => expect(misfiledAs(c.type as AssetType, c.symbol, c.title)).toBe(c.expect));
  }
});
