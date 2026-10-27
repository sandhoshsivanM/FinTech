'use client';
/**
 * The demo vault.
 *
 * Two things this has to get right beyond "some numbers":
 *
 *   1. Symbols must exist in `public/instrument_master.json`, or every
 *      sector and market-cap roll-up renders as "Unclassified" and the
 *      allocation screens look broken. The equity names below are all in the
 *      bundled master.
 *   2. Coverage has to reach every screen. A vault with no insurance leaves the
 *      health score's Protection pillar untracked; one with fewer than two
 *      snapshots leaves every trend chart empty. So this seeds insurance,
 *      ninety days of snapshots, dividends, a watchlist and alerts too.
 */
import { putRecord, clearVault, userRecordCount } from './repo';
import { useApp, uid, repairPostings } from './store';
import { liquidBalance } from '@khazana/domain/accountLedger';
import { investmentTotals } from '@khazana/domain/investmentTotals';
import { sampleEntries, sampleSnapshots } from '@khazana/domain/sampleVault';

// The records themselves are built by @khazana/domain/sampleVault, which Khazana
// Online uses too; this file only writes them into the encrypted local vault.
export async function loadSampleData() {
  const s = useApp.getState();
  const { key, vaultId } = s;
  if (!key) return;
  // Sample data REPLACES the vault, so it is only ever allowed into one that
  // holds nothing of the user's. This used to clear unconditionally — every
  // profile, no confirmation — one tap from Settings away from someone's real
  // finances.
  if (await userRecordCount(vaultId) > 0) {
    throw new Error(
      'Sample data can only be loaded into an empty vault, and this one has '
      + 'your own records. Nothing was changed.',
    );
  }
  // Only structural records remain (seeded categories and accounts); clearing
  // them keeps the load idempotent. Categories are re-seeded by reload().
  await clearVault(vaultId);
  await s.reload();
  const cats = useApp.getState().categories;

  const profileId = useApp.getState().activeProfileId;
  const now = Date.now();
  const write = (entries: { type: string; value: { id: string } & Record<string, unknown> }[]) =>
    Promise.all(entries.map((e) => putRecord(key, e.type, vaultId, e.value.id, e.value)));

  await write(sampleEntries({ vaultId, profileId, categories: cats.map((c) => ({ id: c.id as string, name: c.name })), uid, now }));
  // These records were written straight to storage for speed, which skips the
  // ledger. Build the postings now, or every account balance would read as its
  // opening balance and the sample vault would look broken.
  await repairPostings(key, vaultId);
  await useApp.getState().reload();

  // Net-worth history. Real snapshots are written once a day when the app is
  // opened, so a fresh demo vault has none and every trend chart is empty.
  const { accounts, postings, holdings, liabilities } = useApp.getState();
  const endCash = liquidBalance(accounts, postings).toNumber();
  const endInvest = investmentTotals(holdings).marketValue.toNumber();
  const endLiab = liabilities.reduce((sum, l) => sum + Number(l.principal), 0);
  await write(sampleSnapshots({ vaultId, now, endCash, endInvest, endLiab }));
  await useApp.getState().reload();
}
