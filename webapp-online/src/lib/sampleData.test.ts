import { describe, expect, test, vi } from 'vitest';
import { accountBalances, allEntriesBalanced } from '@khazana/domain/accountLedger';
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
    expect(after.accounts.filter((x) => x.subtype === 'credit_card')).toHaveLength(1);
    expect(after.transfers.length).toBeGreaterThan(0);
    expect(after.goals.length).toBeGreaterThan(0);
    expect(allEntriesBalanced(after.postings)).toBe(true);

    await after.putMany(sampleSnapshots({ vaultId: after.vaultId, now: Date.parse('2026-10-27T10:00:00Z'), endCash: 1_000_000, endInvest: 2_000_000, endLiab: 500_000 }));
    expect(a.app.getState().snapshots).toHaveLength(365);

    // Another device receives all of it.
    await a.sync();
    const b = device(server, dek);
    await b.sync();
    expect(b.app.getState().holdings).toHaveLength(after.holdings.length);
    expect(b.app.getState().snapshots).toHaveLength(365);
  });
});

describe('the sample year reads like a real one', () => {
  // The 1st of a month before the salary time, and an ordinary mid-month day.
  for (const iso of ['2026-11-01T02:00:00Z', '2026-11-17T10:00:00Z']) {
    test(`at ${iso}: a full year, this month's income, every recent day, and no account overdrawn`, async () => {
      const now = Date.parse(iso);
      const a = device(new FakeServer(), newTestDek());
      await a.app.getState().reload();
      const s = a.app.getState();
      await s.putMany(sampleEntries({
        vaultId: s.vaultId, profileId: s.activeProfileId, categories: s.categories.map((c) => ({ id: c.id, name: c.name })),
        uid: () => crypto.randomUUID(), now,
      }));
      const { txns, accounts, postings } = a.app.getState();

      expect(txns.every((t) => t.date <= now)).toBe(true);
      const month = (t: number) => { const d = new Date(t); return d.getFullYear() * 12 + d.getMonth(); };
      // Twelve calendar months, each with income and spending.
      const months = new Set(txns.map((t) => month(t.date)));
      expect(months.size).toBe(12);
      for (const m of months) {
        expect(txns.some((t) => month(t.date) === m && t.type === 'income')).toBe(true);
        expect(txns.some((t) => month(t.date) === m && t.type === 'expense')).toBe(true);
      }
      // Spending on each of the last seven days.
      const dayKey = (t: number) => new Date(t).toDateString();
      for (let i = 0; i < 7; i++) {
        const k = dayKey(now - i * 86400000);
        expect(txns.some((t) => t.type === 'expense' && dayKey(t.date) === k)).toBe(true);
      }
      // SIPs are investments, not spending.
      expect(txns.some((t) => t.type === 'investment')).toBe(true);
      // No bank account ever goes overdrawn at the end, and the card is a debt.
      const bal = accountBalances(accounts, postings);
      for (const acct of accounts.filter((x) => x.subtype === 'bank')) expect(bal.get(acct.id)!.toNumber()).toBeGreaterThan(0);
      const card = accounts.find((x) => x.subtype === 'credit_card')!;
      expect(bal.get(card.id)!.toNumber()).toBeLessThanOrEqual(0);
      expect(a.app.getState().pendingCaptures.filter((c) => c.status === 'pending').length).toBeGreaterThan(0);
    });
  }
});
