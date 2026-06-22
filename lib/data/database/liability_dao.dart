import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'liability_dao.g.dart';

@DriftAccessor(tables: [Liabilities])
class LiabilityDao extends DatabaseAccessor<AppDatabase>
    with _$LiabilityDaoMixin {
  LiabilityDao(super.db);

  Stream<List<LiabilityRow>> watchForVault(String vaultId) =>
      (select(liabilities)..where((l) => l.vaultId.equals(vaultId))).watch();

  Future<List<LiabilityRow>> allForVault(String vaultId) =>
      (select(liabilities)..where((l) => l.vaultId.equals(vaultId))).get();

  Future<void> upsert(LiabilitiesCompanion row) =>
      into(liabilities).insertOnConflictUpdate(row);

  Future<void> deleteById(String id) =>
      (delete(liabilities)..where((l) => l.id.equals(id))).go();
}
