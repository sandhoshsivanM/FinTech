import 'dart:convert';

import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_online/crypto/bytes.dart';
import 'package:khazana_online/crypto/e2e.dart';
import 'package:khazana_online/ledger/ledger.dart';
import 'package:khazana_online/sync/engine.dart';
import 'package:khazana_online/sync/record_store.dart';

Decimal d(String s) => Decimal.parse(s);

void main() {
  final dek = newDek();
  late MemoryRecordStore store;
  late LedgerWriter writer;
  var n = 0;
  var tick = DateTime.utc(2026, 10, 23, 10);

  setUp(() {
    store = MemoryRecordStore();
    n = 0;
    writer = LedgerWriter(() => dek, SyncEngine((m, p, [b]) async => null, store),
        now: () => tick = tick.add(const Duration(seconds: 1)), newId: () => 'id-${++n}');
  });

  Future<Ledger> read() async => readLedger(dek, await store.all());

  test('balances: bank adds income and subtracts spending; a card shows what is owed; money stays exact', () async {
    await writer.addAccount(name: 'HDFC', kind: AccountKind.bank, openingBalance: d('1000.10'));
    await writer.addAccount(name: 'Amex', kind: AccountKind.creditCard, openingBalance: d('0'));
    await writer.addTxn(accountId: 'id-1', type: TxnType.income, amount: d('0.20'), date: '2026-10-01');
    await writer.addTxn(accountId: 'id-1', type: TxnType.expense, amount: d('100.05'), date: '2026-10-02', note: 'Coffee');
    await writer.addTxn(accountId: 'id-2', type: TxnType.expense, amount: d('300.30'), date: '2026-10-03');
    final l = await read();
    final byName = {for (final a in l.accounts) a.name: a};
    expect(balance(byName['HDFC']!, l.transactions), d('900.25'));
    expect(balance(byName['Amex']!, l.transactions), d('300.30'));
    expect(netWorth(l), d('599.95'));
    expect(l.transactions.first.date, '2026-10-03'); // newest first
  });

  test('what is stored is ciphertext: no name or amount in the bytes', () async {
    await writer.addAccount(name: 'Secret Savings', kind: AccountKind.bank, openingBalance: d('424242'));
    final stored = utf8.decode((await store.all()).single.ciphertext!, allowMalformed: true);
    expect(stored, isNot(contains('Secret')));
    expect(stored, isNot(contains('424242')));
    expect((await store.outbox()), hasLength(1));
  });

  test('records written by the web client (its JSON shape) read here', () async {
    final id = RecordId('web-1', accountsCollection, keyVersion);
    await store.put(LocalRecord(
      collection: accountsCollection,
      recordId: 'web-1',
      updatedAt: '2026-10-23T10:00:00.000Z',
      deleted: false,
      ciphertext: encryptRecord(dek, id, {'name': 'From web', 'subtype': 'credit_card', 'openingBalance': '12.5'}),
      keyVersion: keyVersion,
    ));
    final a = (await read()).accounts.single;
    expect((a.name, a.kind, a.openingBalance), ('From web', AccountKind.creditCard, d('12.5')));
  });

  test('an edit keeps the other fields; a deletion hides the transaction', () async {
    await writer.addAccount(name: 'Cash', kind: AccountKind.cash, openingBalance: d('50'));
    var l = await read();
    await writer.updateAccount(l.accounts.single, name: 'Wallet');
    l = await read();
    expect((l.accounts.single.name, l.accounts.single.kind, l.accounts.single.openingBalance), ('Wallet', AccountKind.cash, d('50')));
    await writer.addTxn(accountId: 'id-1', type: TxnType.expense, amount: d('5'), date: '2026-10-05');
    l = await read();
    await writer.deleteTxn(l.transactions.single);
    expect((await read()).transactions, isEmpty);
  });

  test('deleting an account deletes its transactions too', () async {
    await writer.addAccount(name: 'A', kind: AccountKind.bank, openingBalance: d('1'));
    await writer.addAccount(name: 'B', kind: AccountKind.bank, openingBalance: d('1'));
    await writer.addTxn(accountId: 'id-1', type: TxnType.expense, amount: d('1'), date: '2026-10-05');
    await writer.addTxn(accountId: 'id-2', type: TxnType.expense, amount: d('1'), date: '2026-10-05');
    var l = await read();
    await writer.deleteAccount(l.accounts.firstWhere((a) => a.name == 'A'), l);
    l = await read();
    expect(l.accounts.map((a) => a.name), ['B']);
    expect(l.transactions.map((t) => t.accountId), ['id-2']);
  });

  test('a record this key cannot open is skipped, not fatal', () async {
    await writer.addAccount(name: 'Mine', kind: AccountKind.bank, openingBalance: d('1'));
    final other = LedgerWriter(newDek, SyncEngine((m, p, [b]) async => null, store), newId: () => 'foreign');
    await other.addAccount(name: 'Not mine', kind: AccountKind.bank, openingBalance: d('9'));
    expect((await read()).accounts.map((a) => a.name), ['Mine']);
  });

  test('the record is bound to its id: moving ciphertext to another record id does not decrypt', () async {
    await writer.addAccount(name: 'Mine', kind: AccountKind.bank, openingBalance: d('1'));
    final r = (await store.all()).single;
    final moved = LocalRecord(
        collection: r.collection, recordId: 'swapped', updatedAt: r.updatedAt, deleted: false, ciphertext: r.ciphertext, keyVersion: r.keyVersion);
    expect(readLedger(dek, [moved]).accounts, isEmpty);
    expect(toBase64(r.ciphertext!), isNotEmpty);
  });
}
