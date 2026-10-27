import { describe, expect, test } from 'vitest';
import { newDek } from './crypto/e2e';
import { balance, LedgerWriter, netWorth, readLedger, type Ledger } from './ledger';
import type { LocalRecord } from './vault';

function harness() {
  const dek = newDek();
  const saved: LocalRecord[] = [];
  let t = Date.parse('2026-10-23T09:00:00Z');
  const writer = new LedgerWriter(() => dek, { save: async (r) => { saved.push(r); } }, () => new Date((t += 1000)));
  const live = () => {
    const latest = new Map<string, LocalRecord>();
    for (const r of saved) latest.set(`${r.collection}/${r.recordId}`, r);
    return [...latest.values()];
  };
  return { dek, saved, writer, read: async () => readLedger(dek, live()) };
}

describe('ledger', () => {
  test('balances: bank adds income and subtracts spending; a card shows what is owed', async () => {
    const h = harness();
    await h.writer.addAccount({ name: 'HDFC Savings', subtype: 'bank', openingBalance: '25000.00' });
    await h.writer.addAccount({ name: 'Axis Card', subtype: 'credit_card', openingBalance: '1200.00' });
    let ledger = await h.read();
    const bank = ledger.accounts.find((a) => a.subtype === 'bank')!;
    const card = ledger.accounts.find((a) => a.subtype === 'credit_card')!;
    await h.writer.addTxn({ accountId: bank.id, type: 'expense', amount: '450.50', date: '2026-10-22', note: 'Groceries', category: 'Food' });
    await h.writer.addTxn({ accountId: bank.id, type: 'income', amount: '1000', date: '2026-10-23', note: 'Refund', category: 'Other' });
    await h.writer.addTxn({ accountId: card.id, type: 'expense', amount: '300', date: '2026-10-23', note: 'Fuel', category: 'Transport' });
    ledger = await h.read();
    expect(balance(bank, ledger.transactions).toFixed(2)).toBe('25549.50');
    expect(balance(card, ledger.transactions).toFixed(2)).toBe('1500.00');
    expect(netWorth(ledger).toFixed(2)).toBe('24049.50');
    expect(ledger.transactions[0].note).toBe('Fuel');
  });

  test('what is stored is ciphertext: no name or amount in the bytes', async () => {
    const h = harness();
    await h.writer.addAccount({ name: 'HDFC Savings', subtype: 'bank', openingBalance: '25000.00' });
    const bytes = new TextDecoder('latin1').decode(h.saved[0].ciphertext!);
    expect(bytes).not.toContain('HDFC');
    expect(bytes).not.toContain('25000');
  });

  test('an edit keeps the other fields; a deletion hides the transaction', async () => {
    const h = harness();
    await h.writer.addAccount({ name: 'Cash', subtype: 'cash', openingBalance: '0' });
    const acct = (await h.read()).accounts[0];
    await h.writer.addTxn({ accountId: acct.id, type: 'expense', amount: '80', date: '2026-10-23', note: 'Tea', category: 'Food' });
    const txn = (await h.read()).transactions[0];
    await h.writer.updateTxn(txn, { amount: '90' });
    expect((await h.read()).transactions[0]).toMatchObject({ amount: '90', note: 'Tea', category: 'Food', accountId: acct.id });
    await h.writer.deleteTxn((await h.read()).transactions[0]);
    expect((await h.read()).transactions).toHaveLength(0);
    expect(h.saved.at(-1)).toMatchObject({ deleted: true, ciphertext: null });
  });

  test('deleting an account deletes its transactions too', async () => {
    const h = harness();
    await h.writer.addAccount({ name: 'Old wallet', subtype: 'cash', openingBalance: '10' });
    let ledger: Ledger = await h.read();
    await h.writer.addTxn({ accountId: ledger.accounts[0].id, type: 'expense', amount: '5', date: '2026-10-23', note: '', category: 'Other' });
    ledger = await h.read();
    await h.writer.deleteAccount(ledger.accounts[0], ledger);
    expect(await h.read()).toEqual({ accounts: [], transactions: [], cards: [] });
  });

  test('a record this key cannot open is skipped, not fatal', async () => {
    const h = harness();
    await h.writer.addAccount({ name: 'Mine', subtype: 'bank', openingBalance: '1' });
    const other = harness();
    await other.writer.addAccount({ name: 'Not mine', subtype: 'bank', openingBalance: '2' });
    const ledger = await readLedger(h.dek, [...h.saved, ...other.saved]);
    expect(ledger.accounts.map((a) => a.name)).toEqual(['Mine']);
  });
});
