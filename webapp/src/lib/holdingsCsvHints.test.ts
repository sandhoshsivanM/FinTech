// CSV import files gold and silver ETFs under the right type, without ever
// reclassifying a position the user already has.
import { describe, expect, test } from 'vitest';
import { parseHoldingsCsv, planImport } from '@khazana/screens/lib/holdingsCsv';
import type { Holding } from '@khazana/domain/types';

const CSV = 'Symbol,Quantity,Avg cost\nGOLDBEES,100,95\nSILVERBEES,10,90\nRELIANCE,5,2400\n';

describe('import type hints', () => {
  test('the default "import as" files known gold and silver ETFs correctly', () => {
    const { rows } = parseHoldingsCsv(CSV);
    expect(rows.map((r) => [r.symbol, r.assetType])).toEqual([
      ['GOLDBEES', 'gold_etf'],
      ['SILVERBEES', 'silver'],
      ['RELIANCE', 'equity_etf'],
    ]);
  });

  test('a specific "import as" choice is kept for every row', () => {
    const { rows } = parseHoldingsCsv(CSV, 'debt_mf');
    expect(new Set(rows.map((r) => r.assetType))).toEqual(new Set(['debt_mf']));
  });

  test('an existing position keeps the type the user gave it', () => {
    const { rows } = parseHoldingsCsv(CSV);
    const existing = {
      id: 'h1', vaultId: 'v', symbol: 'GOLDBEES', exchange: 'NSE', quantity: '50', avgCost: '90',
      assetType: 'equity_etf',
    } as Holding;
    const plan = planImport(rows, [existing], { vaultId: 'v', newId: () => 'n', now: 0 });
    expect(plan.records.find((r) => r.symbol === 'GOLDBEES')?.assetType).toBe('equity_etf');
  });
});
