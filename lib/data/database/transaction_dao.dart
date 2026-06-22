import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'transaction_dao.g.dart';

/// One DAO per aggregate root (PRD §3C). Monetary aggregation is done in Dart
/// (Decimal), so queries return rows rather than SQL SUM() over TEXT.
@DriftAccessor(tables: [Transactions])
class TransactionDao extends DatabaseAccessor<AppDatabase>
    with _$TransactionDaoMixin {
  TransactionDao(super.db);

  Future<void> upsert(TransactionsCompanion row) {
    return into(transactions).insertOnConflictUpdate(row);
  }

  Future<void> deleteById(String id) {
    return (delete(transactions)..where((t) => t.id.equals(id))).go();
  }

  Future<TransactionRow?> findById(String id) {
    return (select(transactions)..where((t) => t.id.equals(id)))
        .getSingleOrNull();
  }

  /// Newest first.
  Stream<List<TransactionRow>> watchForVault(String vaultId) {
    return (select(transactions)
          ..where((t) => t.vaultId.equals(vaultId))
          ..orderBy([(t) => OrderingTerm.desc(t.date)]))
        .watch();
  }

  Future<List<TransactionRow>> allForVault(String vaultId) {
    return (select(transactions)
          ..where((t) => t.vaultId.equals(vaultId))
          ..orderBy([(t) => OrderingTerm.desc(t.date)]))
        .get();
  }

  /// Transactions within [startMs, endMs] inclusive (Unix ms).
  Future<List<TransactionRow>> inDateRange(
    String vaultId,
    int startMs,
    int endMs,
  ) {
    return (select(transactions)
          ..where((t) =>
              t.vaultId.equals(vaultId) &
              t.date.isBiggerOrEqualValue(startMs) &
              t.date.isSmallerOrEqualValue(endMs))
          ..orderBy([(t) => OrderingTerm.desc(t.date)]))
        .get();
  }

  /// Expense rows for a category within a date range — used by the budget
  /// "spent this month" query (PRD §7C, computed on read).
  Future<List<TransactionRow>> expensesForCategory(
    String vaultId,
    String categoryId,
    int startMs,
    int endMs,
  ) {
    return (select(transactions)
          ..where((t) =>
              t.vaultId.equals(vaultId) &
              t.categoryId.equals(categoryId) &
              t.type.equals('expense') &
              t.date.isBiggerOrEqualValue(startMs) &
              t.date.isSmallerOrEqualValue(endMs)))
        .get();
  }

  /// Full-text search over merchant/note/category via the FTS5 index
  /// (PRD §5/§16). Returns newest-first matches for [rawQuery].
  Future<List<TransactionRow>> search(String vaultId, String rawQuery) {
    final ftsQuery = _toFtsQuery(rawQuery);
    if (ftsQuery.isEmpty) return Future.value(const []);
    return customSelect(
      'SELECT t.* FROM transactions t '
      'JOIN transactions_fts f ON f.txn_id = t.id '
      'WHERE t.vault_id = ?1 AND transactions_fts MATCH ?2 '
      'ORDER BY t.date DESC',
      variables: [Variable.withString(vaultId), Variable.withString(ftsQuery)],
      readsFrom: {transactions},
    ).map((row) => transactions.map(row.data)).get();
  }

  /// Builds a safe FTS5 MATCH expression: each token quoted + prefix-matched,
  /// combined with implicit AND. Avoids injection and `LIKE` scans.
  static String _toFtsQuery(String raw) {
    final tokens = raw
        .toLowerCase()
        .split(RegExp(r'[^a-z0-9]+'))
        .where((t) => t.isNotEmpty)
        .map((t) => '"$t"*');
    return tokens.join(' ');
  }

  Future<int> countForVault(String vaultId) async {
    final exp = countAll();
    final q = selectOnly(transactions)
      ..addColumns([exp])
      ..where(transactions.vaultId.equals(vaultId));
    final row = await q.getSingle();
    return row.read(exp) ?? 0;
  }
}
