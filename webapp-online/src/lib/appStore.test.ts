import { describe, expect, test } from 'vitest';
import { accountBalances, allEntriesBalanced } from '@khazana/domain/accountLedger';
import { D } from '@khazana/domain/money';
import { STORE } from '@khazana/domain/types';
import { cashAcctId, expenseAcctId } from '@khazana/domain/vaultWrites';
import { balance, LedgerWriter } from './ledger';
import { viewOf } from './cards';
import { legacyWriter, ledgerView } from './legacyView';
import { CARDS, LEGACY_ACCOUNTS, LEGACY_TRANSACTIONS } from './sync/codec';
import { device, FakeServer, newTestDek } from './sync/testkit';

const card = { name: 'Axis', network: 'Visa' as const, last4: '1234', limit: '100000', statementDay: 5, dueDay: 25 };

describe('shared store over encrypted sync', () => {
  test('behaves like the offline store: seeded defaults, cash account, double-entry postings, profile scoping', async () => {
    const d = device(new FakeServer(), newTestDek());
    await d.app.getState().reload();
    const s0 = d.app.getState();
    expect(s0.categories.map((c) => c.name)).toContain('Food');
    expect(s0.categories).toHaveLength(11);
    expect(s0.profiles).toHaveLength(1);
    expect(s0.profiles[0].name).toBe('Personal');
    const food = s0.categories.find((c) => c.name === 'Food')!;
    const pid = s0.activeProfileId;

    await s0.put(STORE.txn, { id: 't1', vaultId: 'default', amount: '250.50', type: 'expense', categoryId: food.id, date: 1, createdAt: 1 });
    const s = d.app.getState();
    const t = s.txns[0];
    expect(t.accountId).toBe(cashAcctId(pid));
    expect(t.profileId).toBe(pid);
    expect(s.accounts.map((a) => a.id)).toEqual(expect.arrayContaining([cashAcctId(pid), expenseAcctId(pid, food.id)]));
    expect(s.postings.map((p) => p.id).sort()).toEqual(['t1:cr', 't1:dr']);
    expect(allEntriesBalanced(s.postings)).toBe(true);
    expect(accountBalances(s.accounts, s.postings).get(cashAcctId(pid))!.toString()).toBe('-250.5');

    // Another profile does not see it.
    await s.addProfile('Spouse', 'spouse');
    expect(d.app.getState().txns).toHaveLength(0);
    expect(d.app.getState().profiles).toHaveLength(2);
    await d.app.getState().setActiveProfile(pid);
    expect(d.app.getState().txns).toHaveLength(1);

    await d.app.getState().del(STORE.txn, 't1');
    expect(d.app.getState().txns).toHaveLength(0);
    expect(d.app.getState().postings).toHaveLength(0);
  });

  test('postings are derived: never synced, identical on every device', async () => {
    const server = new FakeServer();
    const dek = newTestDek();
    const a = device(server, dek);
    const b = device(server, dek);
    await a.app.getState().reload();
    const cat = a.app.getState().categories[0];
    const bank = { id: 'bank1', vaultId: 'default', name: 'HDFC', type: 'asset', subtype: 'bank', openingBalance: '1000' };
    await a.app.getState().put(STORE.account, bank);
    await a.app.getState().put(STORE.txn, { id: 't1', vaultId: 'default', amount: '40', type: 'expense', categoryId: cat.id, accountId: 'bank1', date: 1, createdAt: 1 });
    await a.app.getState().put(STORE.transfer, { id: 'x1', vaultId: 'default', fromAccountId: 'bank1', toAccountId: cashAcctId(a.app.getState().activeProfileId), amount: '100', date: 2, createdAt: 2 });
    await a.sync();
    await b.sync();
    await a.sync();

    expect([...server.rows.values()].every((r) => r.collection !== 'posting')).toBe(true);
    const pa = a.app.getState(), pb = b.app.getState();
    expect(pb.postings.map((p) => p.id).sort()).toEqual(pa.postings.map((p) => p.id).sort());
    expect(pb.postings.map((p) => p.id).sort()).toEqual(['t1:cr', 't1:dr', 'x1:cr', 'x1:dr']);
    expect(accountBalances(pb.accounts, pb.postings).get('bank1')!.toString()).toBe('860');
    expect(allEntriesBalanced(pb.postings)).toBe(true);
  });

  test('two devices converge: edits, deletes, concurrent edits (last write wins), and defaults seeded once', async () => {
    const server = new FakeServer();
    const dek = newTestDek();
    const clock = { t: Date.parse('2026-10-27T10:00:00Z') };
    const a = device(server, dek, { clock });
    const b = device(server, dek, { clock });
    await a.app.getState().reload();
    await a.sync();
    // B joins: loads without seeding, syncs, then reloads, as startSync does.
    await b.app.getState().loadOnly();
    expect(b.app.getState().categories).toHaveLength(0);
    await b.sync();
    expect(b.app.getState().categories).toHaveLength(11);
    expect(b.app.getState().profiles).toHaveLength(1);
    expect(b.app.getState().activeProfileId).toBe(a.app.getState().activeProfileId);

    const cat = a.app.getState().categories.find((c) => c.name === 'Rent')!;
    const mk = (id: string, amount: string) => ({ id, vaultId: 'default', amount, type: 'expense', categoryId: cat.id, date: 5, createdAt: 5 });
    await a.app.getState().putMany([{ type: STORE.txn, value: mk('t1', '10') }, { type: STORE.txn, value: mk('t2', '20') }, { type: STORE.txn, value: mk('t3', '30') }]);
    await a.sync(); await b.sync();
    expect(b.app.getState().txns.map((t) => t.id).sort()).toEqual(['t1', 't2', 't3']);

    // Concurrent: A edits t1 first, B edits t1 later -> B wins everywhere. A deletes t2 while B leaves it.
    await a.app.getState().put(STORE.txn, { ...mk('t1', '11') });
    clock.t += 60_000;
    await b.app.getState().put(STORE.txn, { ...mk('t1', '12') });
    await a.app.getState().del(STORE.txn, 't2');
    await a.sync(); await b.sync(); await a.sync();
    for (const dev of [a, b]) {
      const s = dev.app.getState();
      expect(s.txns.map((t) => `${t.id}=${t.amount}`).sort()).toEqual(['t1=12', 't3=30']);
      expect(s.postings.map((p) => p.id).sort()).toEqual(['t1:cr', 't1:dr', 't3:cr', 't3:dr']);
    }
    // Nothing waits in either outbox.
    expect(await a.engine.pending()).toBe(0);
    expect(await b.engine.pending()).toBe(0);
  });

  test('a large import goes up in batches of at most 500', async () => {
    const server = new FakeServer();
    const a = device(server, newTestDek());
    await a.app.getState().reload();
    const cat = a.app.getState().categories[0];
    await a.app.getState().putMany(Array.from({ length: 1100 }, (_, i) => ({
      type: STORE.txn, value: { id: `n${i}`, vaultId: 'default', amount: '1', type: 'expense', categoryId: cat.id, date: i, createdAt: i },
    })));
    await a.sync();
    expect(await a.engine.pending()).toBe(0);
    expect(server.pushes).toBeGreaterThanOrEqual(3);
  });

  test('recurring, reassign, snapshot and captures write through the shared domain logic', async () => {
    const d = device(new FakeServer(), newTestDek());
    await d.app.getState().reload();
    const s = d.app.getState();
    const pid = s.activeProfileId;
    const cat = s.categories.find((c) => c.name === 'Rent')!;
    await s.put(STORE.account, { id: 'bank1', vaultId: 'default', name: 'HDFC', type: 'asset', subtype: 'bank', openingBalance: '5000' });
    await s.put(STORE.recurring, { id: 'r1', vaultId: 'default', amount: '700', type: 'expense', categoryId: cat.id, frequency: 'monthly', nextRun: Date.now() - 40 * 86_400_000, active: true, accountId: 'bank1' });
    const created = await d.app.getState().processRecurring();
    expect(created).toBeGreaterThanOrEqual(1);
    expect(d.app.getState().txns.every((t) => t.accountId === 'bank1' && t.note === 'Recurring')).toBe(true);
    expect(d.app.getState().recurring[0].nextRun).toBeGreaterThan(Date.now() - 86_400_000);

    const moved = await d.app.getState().reassignTxnAccounts('bank1', cashAcctId(pid));
    expect(moved).toBe(created);
    expect(accountBalances(d.app.getState().accounts, d.app.getState().postings).get('bank1')!.toString()).toBe('5000');

    await d.app.getState().captureSnapshot();
    expect(d.app.getState().snapshots).toHaveLength(1);
    const before = d.app.getState().snapshots[0];
    await d.app.getState().captureSnapshot(); // unchanged: no second write
    expect(d.app.getState().snapshots).toEqual([before]);

    const outcome = await d.app.getState().addCaptures([{ text: 'Rs.450.00 spent on your HDFC Bank Credit Card ending 1234 at SWIGGY on 27-10-26', source: 'sms' }]);
    expect(outcome).toEqual(['added']);
    const cap = d.app.getState().pendingCaptures[0];
    await d.app.getState().approveCaptures([{ id: cap.id, edits: { categoryId: cat.id } }]);
    expect(d.app.getState().pendingCaptures[0].status).toBe('approved');
    expect(d.app.getState().txns.some((t) => D(t.amount).eq(450))).toBe(true);
  });

  test('batch undo, profile delete, and UI prefs', async () => {
    const storage = { m: new Map<string, string>() };
    const d = device(new FakeServer(), newTestDek(), { deps: { storage: { getItem: (k) => storage.m.get(k) ?? null, setItem: (k, v) => void storage.m.set(k, v) } } });
    await d.app.getState().reload();
    const cat = d.app.getState().categories[0];
    await d.app.getState().put(STORE.txn, { id: 'i1', vaultId: 'default', amount: '9', type: 'expense', categoryId: cat.id, date: 1, createdAt: 1 });
    const id = await d.app.getState().recordImportBatch({ at: 1, filename: 'x.csv', kind: 'transactions', created: [{ type: STORE.txn, id: 'i1' }], updatedCount: 0 });
    expect(await d.app.getState().undoImportBatch(id)).toBe(3);
    expect(d.app.getState().txns).toHaveLength(0);
    expect(d.app.getState().importBatches[0].undone).toBe(true);
    expect(await d.app.getState().undoImportBatch(id)).toBe(0);

    const first = d.app.getState().activeProfileId;
    await d.app.getState().addProfile('Biz', 'business');
    const biz = d.app.getState().activeProfileId;
    await d.app.getState().renameProfile(biz, 'Shop');
    expect(d.app.getState().profiles.find((p) => p.id === biz)!.name).toBe('Shop');
    await d.app.getState().deleteProfile(biz);
    expect(d.app.getState().activeProfileId).toBe(first);
    expect(d.app.getState().profiles).toHaveLength(1);
    await d.app.getState().deleteProfile(first); // never the last one
    expect(d.app.getState().profiles).toHaveLength(1);

    d.app.getState().toggleGhost();
    d.app.getState().setCurrency('USD');
    d.app.getState().setTheme('dark');
    d.app.getState().setAccent('emerald');
    expect([...storage.m.entries()].sort()).toEqual([
      ['khazana-accent', 'emerald'], ['khazana-active-profile', first], ['khazana-currency', 'USD'], ['khazana-ghost', '1'], ['khazana-theme', 'dark'],
    ]);
  });

  test('attachments are encrypted before they leave, and fetched back', async () => {
    const blobs = new Map<string, Uint8Array>();
    const d = device(new FakeServer(), newTestDek(), { deps: { attachments: { put: async (id, b) => void blobs.set(id, b), get: async (id) => blobs.get(id) } } });
    await d.app.getState().reload();
    const id = await d.app.getState().putAttachment(new File([new Uint8Array([1, 2, 3, 4])], 'r.png', { type: 'image/png' }));
    expect(new TextDecoder('latin1').decode(blobs.get(id)!)).not.toContain('image/png');
    expect(await d.app.getState().getAttachmentUrl(id)).toBe('data:image/png;base64,AQIDBA==');
    expect(await d.app.getState().getAttachmentUrl('missing-0000')).toBeNull();
  });
});

describe('migration from the first online data model', () => {
  async function legacyDevice(server: FakeServer, dek: Uint8Array) {
    const d = device(server, dek);
    const old = new LedgerWriter(() => dek, d.engine, () => new Date(d.clock.t += 1000));
    await old.addAccount({ name: 'HDFC Savings', subtype: 'bank', openingBalance: '25000.00' });
    await old.addAccount({ name: 'Axis Card', subtype: 'credit_card', openingBalance: '1200.00' });
    await old.addAccount({ name: 'Wallet', subtype: 'cash', openingBalance: '300' });
    const ids = (await d.records.all()).map((r) => r.recordId);
    const [bank, cc] = ids;
    await old.addTxn({ accountId: bank, type: 'expense', amount: '450.50', date: '2026-10-22', note: 'Groceries', category: 'food' });
    await old.addTxn({ accountId: bank, type: 'income', amount: '1000', date: '2026-10-23', note: 'Refund', category: 'Cashback' });
    await old.addTxn({ accountId: cc, type: 'expense', amount: '300', date: '2026-10-23', note: 'Fuel', category: '', last4: '1234' });
    return { d, bank, cc };
  }

  test('old accounts and transactions become shared entities, once, and other devices converge', async () => {
    const server = new FakeServer();
    const dek = newTestDek();
    const { d, bank, cc } = await legacyDevice(server, dek);
    // Cards are untouched by the migration.
    await d.app.getState().putCard(card);
    await d.sync();

    const s = d.app.getState();
    const pid = s.activeProfileId;
    const acct = s.accounts.find((a) => a.id === bank)!;
    expect(acct).toMatchObject({ name: 'HDFC Savings', type: 'asset', subtype: 'bank', openingBalance: '25000.00', vaultId: 'default', profileId: pid });
    expect(s.accounts.find((a) => a.id === cc)).toMatchObject({ type: 'liability', subtype: 'credit_card', openingBalance: '1200.00' });
    expect(s.accounts.find((a) => a.name === 'Wallet')).toMatchObject({ type: 'asset', subtype: 'cash' });

    const names = new Map(s.categories.map((c) => [c.id, c.name]));
    const byNote = new Map(s.txns.map((t) => [t.note, t]));
    expect(names.get(byNote.get('Groceries')!.categoryId)).toBe('Food'); // matched case-insensitively
    expect(s.categories.filter((c) => c.name === 'Food')).toHaveLength(1);
    expect(names.get(byNote.get('Refund')!.categoryId)).toBe('Cashback'); // created
    expect(names.get(byNote.get('Fuel')!.categoryId)).toBe('Other'); // empty -> Other
    const g = byNote.get('Groceries')!;
    expect(typeof g.date).toBe('number');
    expect(new Date(g.date).getFullYear()).toBe(2026);
    expect(new Date(g.date).getMonth()).toBe(9);
    expect(new Date(g.date).getDate()).toBe(22);
    expect(g).toMatchObject({ accountId: bank, amount: '450.50', type: 'expense', profileId: pid });
    expect(byNote.get('Fuel')!.last4).toBe('1234');
    expect(byNote.get('Groceries')!.last4).toBeUndefined();

    // Old records are tombstoned (legacy collections hold no live record), the new ones are on the server.
    const live = (c: string) => [...server.rows.values()].filter((r) => r.collection === c && !r.deleted).length;
    expect(live(LEGACY_ACCOUNTS)).toBe(0);
    expect(live(LEGACY_TRANSACTIONS)).toBe(0);
    expect(live('txn')).toBe(3);
    expect(live(CARDS)).toBe(1);

    // The old screens' view of the same data matches what they showed before.
    const view = ledgerView(s);
    expect(view.accounts.map((a) => a.name)).toEqual(['Axis Card', 'HDFC Savings', 'Wallet']);
    expect(balance(view.accounts.find((a) => a.id === bank)!, view.transactions).toFixed(2)).toBe('25549.50');
    expect(balance(view.accounts.find((a) => a.id === cc)!, view.transactions).toFixed(2)).toBe('1500.00');
    expect(view.transactions[0].date).toBe('2026-10-23');

    // Loading again migrates nothing more.
    const writes = server.seq;
    await d.sync();
    expect(server.seq).toBe(writes);
    expect(d.app.getState().txns).toHaveLength(3);

    // A second device gets the new shapes only.
    const other = device(server, dek);
    await other.sync();
    expect(other.app.getState().txns).toHaveLength(3);
    expect(other.app.getState().accounts.filter((a) => a.subtype === 'bank')).toHaveLength(1);
    expect(other.app.getState().cards.map((c) => c.name)).toEqual(['Axis']);
  });

  test('two devices that both hold old data migrate to the same records', async () => {
    const server = new FakeServer();
    const dek = newTestDek();
    const a = device(server, dek);
    const b = device(server, dek);
    await new LedgerWriter(() => dek, a.engine, () => new Date(a.clock.t += 1000)).addAccount({ name: 'Cash', subtype: 'cash', openingBalance: '5' });
    await a.engine.sync();
    await b.engine.sync(); // B pulls the old record
    await a.app.getState().reload(); // A migrates
    await a.engine.sync();
    await b.app.getState().reload(); // B migrates the same record independently
    await b.engine.sync();
    await a.sync();
    await b.sync();
    for (const dev of [a, b]) expect(dev.app.getState().accounts.filter((x) => x.name === 'Cash' && x.subtype === 'cash' && x.type === 'asset' && x.openingBalance === '5')).toHaveLength(1);
  });
});

describe('the first online screens on top of the shared store', () => {
  test('the old writer API reads and writes through entities, cards included', async () => {
    const server = new FakeServer();
    const d = device(server, newTestDek());
    await d.app.getState().reload();
    const w = legacyWriter(d.app, () => `w-${Math.random().toString(36).slice(2, 8)}`);
    await w.addAccount({ name: 'HDFC', subtype: 'bank', openingBalance: '100' });
    await w.addAccount({ name: 'Axis', subtype: 'credit_card', openingBalance: '0' });
    let view = ledgerView(d.app.getState());
    const bank = view.accounts.find((a) => a.name === 'HDFC')!;
    const cc = view.accounts.find((a) => a.name === 'Axis')!;
    await w.addTxn({ accountId: bank.id, type: 'expense', amount: '30', date: '2026-10-20', note: 'Tea', category: 'Food' });
    await w.addTxn({ accountId: cc.id, type: 'expense', amount: '500', date: '2026-10-21', note: 'Shoes', category: 'Footwear', last4: '1234' });
    view = ledgerView(d.app.getState());
    expect(balance(bank, view.transactions).toFixed(2)).toBe('70.00');
    expect(view.transactions.find((t) => t.note === 'Shoes')!.category).toBe('Footwear');
    expect(d.app.getState().categories.filter((c) => c.name === 'Food')).toHaveLength(1);

    const shoes = view.transactions.find((t) => t.note === 'Shoes')!;
    await w.updateTxn(shoes, { amount: '600', last4: undefined });
    expect(ledgerView(d.app.getState()).transactions.find((t) => t.note === 'Shoes')).toMatchObject({ amount: '600' });
    expect(ledgerView(d.app.getState()).transactions.find((t) => t.note === 'Shoes')!.last4).toBeUndefined();

    // Cards: the same maths as before, on the same ledger shape.
    await w.addCard(card);
    await w.updateTxn(ledgerView(d.app.getState()).transactions.find((t) => t.note === 'Shoes')!, { last4: '1234' });
    view = ledgerView(d.app.getState());
    expect(view.cards).toHaveLength(1);
    const v = viewOf(view.cards[0], view.transactions, new Date('2026-10-27T10:00:00'));
    expect(v.owed.toString()).toBe('600');
    await w.updateCard(view.cards[0], { ...card, limit: '50000' });
    expect(ledgerView(d.app.getState()).cards[0].limit).toBe('50000');

    await w.deleteAccount(bank, view);
    view = ledgerView(d.app.getState());
    expect(view.accounts.map((a) => a.name)).toEqual(['Axis']);
    expect(view.transactions.map((t) => t.note)).toEqual(['Shoes']);
    await w.deleteCard(view.cards[0]);
    expect(ledgerView(d.app.getState()).cards).toHaveLength(0);
  });
});
