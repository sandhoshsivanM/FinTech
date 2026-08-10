// The write-path invariants that keep the ledger balanced.
import { describe, expect, test } from 'vitest';
import { supersedeMutations } from './store';
import { STORE, type Transfer, type Txn } from './types';

const txn = (id: string): Txn =>
  ({ id, vaultId: 'v', amount: '100', type: 'expense', categoryId: 'c1', date: 0, createdAt: 0 });
const transfer = (id: string): Transfer =>
  ({ id, vaultId: 'v', amount: '100', fromAccountId: 'a1', toAccountId: 'a2', date: 0, createdAt: 0 });

describe('changing an entry from a transaction to a transfer', () => {
  // The add screen reuses one `editId` across its mode selector. Both kinds
  // claim the same `<id>:dr` / `:cr` postings, so without this the vault ended
  // up holding two records under one id, sharing one pair of legs — the entry
  // appeared twice in the timeline and the ledger described only one of them.

  test('writing a transfer over an existing transaction retires the transaction', () => {
    const state = { txns: [txn('e1')], transfers: [] };
    expect(supersedeMutations(state, STORE.transfer, 'e1'))
      .toEqual([{ op: 'delete', type: STORE.txn, id: 'e1' }]);
  });

  test('writing a transaction over an existing transfer retires the transfer', () => {
    const state = { txns: [], transfers: [transfer('e1')] };
    expect(supersedeMutations(state, STORE.txn, 'e1'))
      .toEqual([{ op: 'delete', type: STORE.transfer, id: 'e1' }]);
  });

  test('an ordinary edit that keeps the same kind deletes nothing', () => {
    const state = { txns: [txn('e1')], transfers: [] };
    expect(supersedeMutations(state, STORE.txn, 'e1')).toEqual([]);
  });

  test('a brand-new entry deletes nothing', () => {
    expect(supersedeMutations({ txns: [], transfers: [] }, STORE.txn, 'new')).toEqual([]);
  });

  test('an unrelated entry of the other kind is left alone', () => {
    const state = { txns: [txn('e1')], transfers: [transfer('e2')] };
    expect(supersedeMutations(state, STORE.transfer, 'e9')).toEqual([]);
  });
});
