import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'budget_dao.g.dart';

/// One DAO per aggregate root (PRD §3C). Note: there is no stored `spent`
/// column — spent is always computed from transactions (PRD §7C).
@DriftAccessor(tables: [Budgets])
class BudgetDao extends DatabaseAccessor<AppDatabase> with _$BudgetDaoMixin {
  BudgetDao(super.db);

  Stream<List<BudgetRow>> watchForVault(String vaultId) {
    return (select(budgets)..where((b) => b.vaultId.equals(vaultId))).watch();
  }

  Future<List<BudgetRow>> allForVault(String vaultId) {
    return (select(budgets)..where((b) => b.vaultId.equals(vaultId))).get();
  }

  Future<void> upsert(BudgetsCompanion row) {
    return into(budgets).insertOnConflictUpdate(row);
  }

  Future<void> deleteById(String id) {
    return (delete(budgets)..where((b) => b.id.equals(id))).go();
  }
}
