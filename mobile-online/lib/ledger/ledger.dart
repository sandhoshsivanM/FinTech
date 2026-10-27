// Khazana Online's accounts and transactions as synced records, the same
// shapes as webapp-online/src/lib/ledger.ts. Every value is encrypted with the
// account's data key before it is stored or sent; this is the only place that
// sees them decrypted. Money is Decimal, never double.
import 'dart:typed_data';

import 'package:decimal/decimal.dart';
import 'package:uuid/uuid.dart';

import '../crypto/e2e.dart';
import '../sync/engine.dart';
import '../sync/record_store.dart';

const accountsCollection = 'accounts';
const transactionsCollection = 'transactions';

/// The offline app's subtypes, so a later import from a backup maps one to one.
enum AccountKind {
  bank('bank', 'Bank'),
  cash('cash', 'Cash'),
  creditCard('credit_card', 'Credit card');

  const AccountKind(this.wire, this.label);
  final String wire;
  final String label;
  static AccountKind parse(String wire) => values.firstWhere((k) => k.wire == wire);
}

class Account {
  const Account({required this.id, required this.name, required this.kind, required this.openingBalance, required this.updatedAt});
  final String id;
  final String name;
  final AccountKind kind;
  final Decimal openingBalance;
  final String updatedAt;

  Map<String, Object?> get value => {'name': name, 'subtype': kind.wire, 'openingBalance': openingBalance.toString()};
}

enum TxnType { expense, income }

class Txn {
  const Txn({
    required this.id,
    required this.accountId,
    required this.type,
    required this.amount,
    required this.date,
    required this.note,
    required this.category,
    required this.updatedAt,
  });
  final String id;
  final String accountId;
  final TxnType type;
  final Decimal amount;

  /// yyyy-MM-dd
  final String date;
  final String note;
  final String category;
  final String updatedAt;

  Map<String, Object?> get value => {
        'accountId': accountId,
        'type': type.name,
        'amount': amount.toString(),
        'date': date,
        'note': note,
        'category': category,
      };
}

class Ledger {
  const Ledger(this.accounts, this.transactions);
  final List<Account> accounts;
  final List<Txn> transactions;
  static const empty = Ledger([], []);
}

/// Decrypts every live record. A record this key can't open is skipped, not fatal.
Ledger readLedger(Uint8List dek, List<LocalRecord> records) {
  final accounts = <Account>[];
  final txns = <Txn>[];
  for (final r in records) {
    if (r.deleted || r.ciphertext == null) continue;
    final id = RecordId(r.recordId, r.collection, r.keyVersion);
    try {
      if (r.collection == accountsCollection) {
        final v = decryptRecord(dek, id, r.ciphertext!) as Map<String, dynamic>;
        accounts.add(Account(
          id: r.recordId,
          name: v['name'] as String,
          kind: AccountKind.parse(v['subtype'] as String),
          openingBalance: Decimal.parse(v['openingBalance'] as String),
          updatedAt: r.updatedAt,
        ));
      } else if (r.collection == transactionsCollection) {
        final v = decryptRecord(dek, id, r.ciphertext!) as Map<String, dynamic>;
        txns.add(Txn(
          id: r.recordId,
          accountId: v['accountId'] as String,
          type: TxnType.values.byName(v['type'] as String),
          amount: Decimal.parse(v['amount'] as String),
          date: v['date'] as String,
          note: (v['note'] as String?) ?? '',
          category: (v['category'] as String?) ?? '',
          updatedAt: r.updatedAt,
        ));
      }
    } on Object {
      // Written under another key version, or damaged (or a type this build
      // doesn't know): leave it out.
    }
  }
  accounts.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  txns.sort((a, b) {
    final byDate = b.date.compareTo(a.date);
    return byDate != 0 ? byDate : b.updatedAt.compareTo(a.updatedAt);
  });
  return Ledger(accounts, txns);
}

/// Bank and cash: what's there (opening + income - expense). Credit card: what's
/// owed (opening + spending - payments), shown as a positive amount owed.
Decimal balance(Account account, List<Txn> transactions) {
  var flow = Decimal.zero;
  for (final t in transactions.where((t) => t.accountId == account.id)) {
    flow += t.type == TxnType.income ? t.amount : -t.amount;
  }
  return account.kind == AccountKind.creditCard ? account.openingBalance - flow : account.openingBalance + flow;
}

/// Bank and cash minus card dues.
Decimal netWorth(Ledger ledger) {
  var total = Decimal.zero;
  for (final a in ledger.accounts) {
    final b = balance(a, ledger.transactions);
    total += a.kind == AccountKind.creditCard ? -b : b;
  }
  return total;
}

/// Writes: encrypt, store locally (shown at once), queue for the server.
class LedgerWriter {
  LedgerWriter(this._dek, this._engine, {DateTime Function()? now, String Function()? newId})
      : _now = now ?? DateTime.now,
        _newId = newId ?? (() => const Uuid().v4());

  final Uint8List Function() _dek;
  final SyncEngine _engine;
  final DateTime Function() _now;
  final String Function() _newId;

  Future<void> _write(String collection, String recordId, Map<String, Object?>? value) {
    final id = RecordId(recordId, collection, keyVersion);
    return _engine.save(LocalRecord(
      collection: collection,
      recordId: recordId,
      updatedAt: _now().toUtc().toIso8601String(),
      deleted: value == null,
      ciphertext: value == null ? null : encryptRecord(_dek(), id, value),
      keyVersion: keyVersion,
    ));
  }

  Future<void> addAccount({required String name, required AccountKind kind, required Decimal openingBalance}) =>
      _write(accountsCollection, _newId(), {'name': name, 'subtype': kind.wire, 'openingBalance': openingBalance.toString()});

  Future<void> updateAccount(Account a, {String? name, AccountKind? kind, Decimal? openingBalance}) => _write(accountsCollection, a.id, {
        'name': name ?? a.name,
        'subtype': (kind ?? a.kind).wire,
        'openingBalance': (openingBalance ?? a.openingBalance).toString(),
      });

  Future<void> addTxn({
    required String accountId,
    required TxnType type,
    required Decimal amount,
    required String date,
    String note = '',
    String category = '',
  }) =>
      _write(transactionsCollection, _newId(),
          {'accountId': accountId, 'type': type.name, 'amount': amount.toString(), 'date': date, 'note': note, 'category': category});

  Future<void> deleteTxn(Txn t) => _write(transactionsCollection, t.id, null);

  /// Deletes the account and its transactions (each a tombstone).
  Future<void> deleteAccount(Account a, Ledger ledger) async {
    for (final t in ledger.transactions.where((t) => t.accountId == a.id)) {
      await deleteTxn(t);
    }
    await _write(accountsCollection, a.id, null);
  }
}
