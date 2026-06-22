import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'recurring_dao.g.dart';

@DriftAccessor(tables: [RecurringRules])
class RecurringDao extends DatabaseAccessor<AppDatabase>
    with _$RecurringDaoMixin {
  RecurringDao(super.db);

  Stream<List<RecurringRuleRow>> watchForVault(String vaultId) =>
      (select(recurringRules)..where((r) => r.vaultId.equals(vaultId))).watch();

  Future<List<RecurringRuleRow>> activeForVault(String vaultId) {
    return (select(recurringRules)
          ..where((r) => r.vaultId.equals(vaultId) & r.active.equals(true)))
        .get();
  }

  Future<void> upsert(RecurringRulesCompanion row) =>
      into(recurringRules).insertOnConflictUpdate(row);

  Future<void> deleteById(String id) =>
      (delete(recurringRules)..where((r) => r.id.equals(id))).go();
}
