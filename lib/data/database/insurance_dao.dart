import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'insurance_dao.g.dart';

@DriftAccessor(tables: [Insurances])
class InsuranceDao extends DatabaseAccessor<AppDatabase>
    with _$InsuranceDaoMixin {
  InsuranceDao(super.db);

  Stream<List<InsuranceRow>> watchForVault(String vaultId) =>
      (select(insurances)..where((i) => i.vaultId.equals(vaultId))).watch();

  Future<List<InsuranceRow>> allForVault(String vaultId) =>
      (select(insurances)..where((i) => i.vaultId.equals(vaultId))).get();

  Future<void> upsert(InsurancesCompanion row) =>
      into(insurances).insertOnConflictUpdate(row);

  Future<void> deleteById(String id) =>
      (delete(insurances)..where((i) => i.id.equals(id))).go();
}
