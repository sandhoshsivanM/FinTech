import { describe, expect, test, vi } from 'vitest';
import { allEntriesBalanced } from '@khazana/domain/accountLedger';
import { sampleEntries, sampleSnapshots } from '@khazana/domain/sampleVault';
import { isEmptyAccount } from './sampleData';
import { device, FakeServer, newTestDek } from './sync/testkit';

describe('the sample year on an empty account', () => {
  test('fills every screen, balances, syncs to another device, and is written as one batch', async () => {
    const server = new FakeServer();
    const dek = newTestDek();
    const a = device(server, dek);
    await a.app.getState().reload();
    expect(isEmptyAccount(a.app.getState())).toBe(true);

    const save = vi.spyOn(a.records, 'saveMany');
    const s = a.app.getState();
    const entries = sampleEntries({
      vaultId: s.vaultId, profileId: s.activeProfileId, categories: s.categories.map((c) => ({ id: c.id, name: c.name })),
      uid: () => crypto.randomUUID(), now: Date.parse('2026-10-27T10:00:00Z'),
    });
    await s.putMany(entries);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].length).toBeGreaterThan(entries.length);

    const after = a.app.getState();
    expect(isEmptyAccount(after)).toBe(false);
    expect(after.holdings.length).toBeGreaterThan(20);
    expect(after.accounts.filter((x) => x.subtype === 'bank')).toHaveLength(3);
    expect(after.transfers.length).toBeGreaterThan(0);
    expect(after.goals.length).toBeGreaterThan(0);
    expect(allEntriesBalanced(after.postings)).toBe(true);

    await after.putMany(sampleSnapshots({ vaultId: after.vaultId, now: Date.parse('2026-10-27T10:00:00Z'), endCash: 1_000_000, endInvest: 2_000_000, endLiab: 500_000 }));
    expect(a.app.getState().snapshots).toHaveLength(90);

    // Another device receives all of it.
    await a.sync();
    const b = device(server, dek);
    await b.sync();
    expect(b.app.getState().holdings).toHaveLength(after.holdings.length);
    expect(b.app.getState().snapshots).toHaveLength(90);
  });
});
