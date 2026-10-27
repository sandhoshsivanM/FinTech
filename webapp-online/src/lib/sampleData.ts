// A sample year for an EMPTY account, so a visitor can see every screen filled in.
// The records are built by @khazana/domain/sampleVault (the same ones the offline app
// loads) and written through the store as two batches, so they sync like anything else.
import { investmentTotals } from '@khazana/domain/investmentTotals';
import { liquidBalance } from '@khazana/domain/accountLedger';
import { sampleEntries, sampleSnapshots } from '@khazana/domain/sampleVault';
import type { KhazanaStore } from '@khazana/screens/store';
import { useAppStore } from './store';

/** True when the account holds nothing of the user's yet (only the seeded profile, categories and structural accounts). */
export function isEmptyAccount(s: Pick<KhazanaStore, 'txns' | 'transfers' | 'holdings' | 'liabilities' | 'goals' | 'budgets' | 'insurances' | 'recurring' | 'accounts'>): boolean {
  return s.txns.length === 0 && s.transfers.length === 0 && s.holdings.length === 0 && s.liabilities.length === 0
    && s.goals.length === 0 && s.budgets.length === 0 && s.insurances.length === 0 && s.recurring.length === 0
    && !s.accounts.some((a) => a.subtype === 'bank' || a.subtype === 'credit_card');
}

export async function loadSampleData(): Promise<void> {
  const store = useAppStore.getState();
  if (!isEmptyAccount(store)) {
    throw new Error('Sample data can only be loaded into an empty account, and this one has your own records. Nothing was changed.');
  }
  const now = Date.now();
  const { vaultId, activeProfileId: profileId, categories } = store;
  await store.putMany(sampleEntries({
    vaultId, profileId, categories: categories.map((c) => ({ id: c.id, name: c.name })), uid: () => crypto.randomUUID(), now,
  }));
  const { accounts, postings, holdings, liabilities } = useAppStore.getState();
  await useAppStore.getState().putMany(sampleSnapshots({
    vaultId, now,
    endCash: liquidBalance(accounts, postings).toNumber(),
    endInvest: investmentTotals(holdings).marketValue.toNumber(),
    endLiab: liabilities.reduce((sum, l) => sum + Number(l.principal), 0),
  }));
}
