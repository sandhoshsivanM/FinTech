import 'package:drift/drift.dart';

import '../../domain/entities/transaction.dart';
import '../../domain/repositories/transaction_repository.dart';
import '../database/app_database.dart';
import '../database/transaction_dao.dart';

/// Drift-backed implementation (PRD §3C: `DriftTransactionRepository`).
/// Maps between Drift rows and pure-domain [Txn] entities.
class DriftTransactionRepository implements ITransactionRepository {
  DriftTransactionRepository(this._dao);

  final TransactionDao _dao;

  @override
  Stream<List<Txn>> watch(String vaultId) =>
      _dao.watchForVault(vaultId).map((rows) => rows.map(_toEntity).toList());

  @override
  Future<List<Txn>> getAll(String vaultId) async =>
      (await _dao.allForVault(vaultId)).map(_toEntity).toList();

  @override
  Future<List<Txn>> getInRange(
      String vaultId, DateTime start, DateTime end) async {
    final rows = await _dao.inDateRange(
        vaultId, start.millisecondsSinceEpoch, end.millisecondsSinceEpoch);
    return rows.map(_toEntity).toList();
  }

  @override
  Future<Txn?> getById(String id) async {
    final row = await _dao.findById(id);
    return row == null ? null : _toEntity(row);
  }

  @override
  Future<void> save(Txn txn) => _dao.upsert(_toCompanion(txn));

  @override
  Future<void> delete(String id) => _dao.deleteById(id);

  @override
  Future<int> count(String vaultId) => _dao.countForVault(vaultId);

  @override
  Future<List<Txn>> search(String vaultId, String query) async =>
      (await _dao.search(vaultId, query)).map(_toEntity).toList();

  static Txn _toEntity(TransactionRow r) => Txn(
        id: r.id,
        vaultId: r.vaultId,
        amount: r.amount,
        type: r.type == 'income' ? TxnType.income : TxnType.expense,
        categoryId: r.categoryId,
        merchant: r.merchant,
        note: r.note,
        date: DateTime.fromMillisecondsSinceEpoch(r.date),
        createdAt: DateTime.fromMillisecondsSinceEpoch(r.createdAt),
      );

  static TransactionsCompanion _toCompanion(Txn t) => TransactionsCompanion(
        id: Value(t.id),
        vaultId: Value(t.vaultId),
        amount: Value(t.amount),
        type: Value(t.type == TxnType.income ? 'income' : 'expense'),
        categoryId: Value(t.categoryId),
        merchant: Value(t.merchant),
        note: Value(t.note),
        date: Value(t.date.millisecondsSinceEpoch),
        createdAt: Value(t.createdAt.millisecondsSinceEpoch),
      );
}
