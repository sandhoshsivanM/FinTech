import 'package:drift/drift.dart';

import '../../domain/entities/budget.dart';
import '../../domain/repositories/budget_repository.dart';
import '../database/app_database.dart';
import '../database/budget_dao.dart';

/// Drift-backed budget repository (PRD §3C `DriftBudgetRepository`).
class DriftBudgetRepository implements IBudgetRepository {
  DriftBudgetRepository(this._dao);

  final BudgetDao _dao;

  @override
  Stream<List<Budget>> watch(String vaultId) =>
      _dao.watchForVault(vaultId).map((rows) => rows.map(_toEntity).toList());

  @override
  Future<List<Budget>> getAll(String vaultId) async =>
      (await _dao.allForVault(vaultId)).map(_toEntity).toList();

  @override
  Future<void> save(Budget b) => _dao.upsert(BudgetsCompanion(
        id: Value(b.id),
        vaultId: Value(b.vaultId),
        categoryId: Value(b.categoryId),
        periodType: Value(b.periodType),
        amountLimit: Value(b.amountLimit),
        rolloverEnabled: Value(b.rolloverEnabled),
        alertThresholdPct: Value(b.alertThresholdPct),
        createdAt: Value(DateTime.now().millisecondsSinceEpoch),
      ));

  @override
  Future<void> delete(String id) => _dao.deleteById(id);

  static Budget _toEntity(BudgetRow r) => Budget(
        id: r.id,
        vaultId: r.vaultId,
        categoryId: r.categoryId,
        amountLimit: r.amountLimit,
        periodType: r.periodType,
        rolloverEnabled: r.rolloverEnabled,
        alertThresholdPct: r.alertThresholdPct,
      );
}
