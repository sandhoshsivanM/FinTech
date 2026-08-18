// The gate importBackup runs on a decoded backup before anything is written.
//
// It refused an intact file: "This backup does not pass its own integrity
// checks (Current exchange rates: No exchange rate has ever been recorded for
// USD ...)". Two faults, one message. The call site never passed the backup's
// own `fxRates`, so `fx-current` saw an empty rate table and failed every
// backup holding a single foreign position — while the rates sat unread in the
// same file. And the gate blocked on *any* error-level check, so even a
// genuinely unset rate, which is a thing to go and type rather than damage,
// stood between someone and their only copy.
//
// These pin both halves, and the structural checks that must still refuse.
import { describe, expect, test } from 'vitest';
import { runDiagnostics, restoreBlockers, RESTORE_BLOCKING } from '@/domain/diagnostics';
import { encodeBackup, decodeBackup } from './backupFormat';
import { deriveKey } from './crypto';
import { STORE } from './types';
import type { Account, Category, FxRate, Holding, HoldingLot, Posting, Txn } from './types';

/** A decoded backup's records, in the shape importBackup hands to the checker. */
const snapshot = (over: Partial<Parameters<typeof runDiagnostics>[0]> = {}) => ({
  txns: [] as Txn[], transfers: [], postings: [] as Posting[],
  accounts: [] as Account[], categories: [] as Category[],
  holdings: [] as Holding[], dividends: [], lots: [] as HoldingLot[],
  fxRates: [] as FxRate[],
  now: Date.UTC(2026, 7, 18),
  ...over,
});

const gate = (over: Parameters<typeof snapshot>[0] = {}) =>
  restoreBlockers(runDiagnostics(snapshot(over)));

const acct = (id: string): Account =>
  ({ id, vaultId: 'v', name: id, type: 'asset', subtype: 'bank', openingBalance: '0' });
const leg = (id: string, entryId: string, accountId: string, amount: string): Posting =>
  ({ id, vaultId: 'v', entryId, accountId, amount });
const usdHolding: Holding = {
  id: 'h1', vaultId: 'v', symbol: 'AAPL', exchange: 'NASDAQ', quantity: '10',
  avgCost: '100', lastPrice: '120', assetType: 'equity_etf', firstPurchaseDate: 0,
  currency: 'USD',
};
const usdRate: FxRate =
  { id: 'USD', code: 'USD', rateToInr: '88', asOf: Date.UTC(2026, 7, 1), source: 'manual' };

describe('a backup holding a foreign position', () => {
  test('restores when the file carries its own rate — the rates are now passed through', () => {
    expect(gate({ holdings: [usdHolding], fxRates: [usdRate] })).toEqual([]);
  });

  test('restores even with no rate recorded at all — the bug', () => {
    // This is the exact refusal the user hit. `fx-current` still reports an
    // error to the Diagnostics screen; it just no longer gates the restore.
    const checks = runDiagnostics(snapshot({ holdings: [usdHolding], fxRates: [] }));
    expect(checks.find((c) => c.id === 'fx-current')!.level).toBe('error');
    expect(gate({ holdings: [usdHolding], fxRates: [] })).toEqual([]);
  });
});

describe('structural damage still refuses', () => {
  test('an entry whose postings do not sum to zero blocks', () => {
    const blockers = gate({
      accounts: [acct('a1'), acct('a2')],
      postings: [leg('p1', 'e1', 'a1', '100'), leg('p2', 'e1', 'a2', '-40')],
    });
    expect(blockers.map((c) => c.id)).toContain('ledger-balanced');
  });

  test('a posting pointing at an account the backup does not contain blocks', () => {
    const blockers = gate({
      accounts: [acct('a1')],
      postings: [leg('p1', 'e1', 'a1', '100'), leg('p2', 'e1', 'gone', '-100')],
    });
    expect(blockers.map((c) => c.id)).toContain('posting-accounts');
  });

  test('several failures are all reported, not just the first', () => {
    const blockers = gate({
      accounts: [acct('a1')],
      postings: [leg('p1', 'e1', 'a1', '100'), leg('p2', 'e1', 'gone', '-40')],
    });
    expect(blockers.length).toBeGreaterThan(1);
    // What importBackup renders into the BackupError message.
    const reasons = blockers.map((c) => `${c.label}: ${c.detail}`).join('; ');
    expect(reasons).toContain('Double-entry balance');
    expect(reasons).toContain('Posting accounts');
  });
});

describe('through a real backup file', () => {
  // The other half of the bug was plumbing: the rates were in the file all
  // along, exportBackup having written every STORE key. This walks one out
  // through the envelope and back into the gate, the way importBackup does.
  test('the rates survive encode/decode and reach the checker', async () => {
    const data: Record<string, unknown[]> = {};
    for (const type of Object.values(STORE)) data[type] = [];
    data[STORE.holding] = [usdHolding];
    data[STORE.fxRate] = [usdRate];

    const file = await encodeBackup(
      { vaultId: 'v', exportedAt: 0, data } as Parameters<typeof encodeBackup>[0],
      '1234', 3, '1.0.0',
    );
    const key = await deriveKey('unused', crypto.getRandomValues(new Uint8Array(16)));
    const decoded = await decodeBackup(file, '1234', key, 3);

    const parsed = decoded.body as unknown as { data: Record<string, unknown[]> };
    const incoming = <T,>(type: string) => (parsed.data[type] ?? []) as T[];
    expect(incoming<FxRate>(STORE.fxRate)).toEqual([usdRate]);

    const checks = runDiagnostics(snapshot({
      holdings: incoming<Holding>(STORE.holding),
      fxRates: incoming<FxRate>(STORE.fxRate),
    }));
    expect(checks.find((c) => c.id === 'fx-current')!.level).toBe('ok');
    expect(restoreBlockers(checks)).toEqual([]);
  });
});

describe('the blocking set is an allowlist', () => {
  test('a clean backup blocks on nothing', () => {
    expect(gate()).toEqual([]);
  });

  test('checks about data the user has not typed yet are not in it', () => {
    for (const id of ['fx-current', 'fx-rates', 'holding-prices', 'txn-categories']) {
      expect(RESTORE_BLOCKING.has(id)).toBe(false);
    }
  });

  test('checks about state an incoming snapshot cannot have are not in it', () => {
    // `unreadableRecords` and `attachmentIds` describe *this* vault's storage,
    // not the file's, and importBackup has neither to give.
    for (const id of ['record-readable', 'attachment-links']) {
      expect(RESTORE_BLOCKING.has(id)).toBe(false);
    }
  });
});
