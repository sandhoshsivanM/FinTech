import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'holding_dao.g.dart';

@DriftAccessor(tables: [Holdings])
class HoldingDao extends DatabaseAccessor<AppDatabase> with _$HoldingDaoMixin {
  HoldingDao(super.db);

  Stream<List<HoldingRow>> watchForVault(String vaultId) =>
      (select(holdings)..where((h) => h.vaultId.equals(vaultId))).watch();

  Future<List<HoldingRow>> allForVault(String vaultId) =>
      (select(holdings)..where((h) => h.vaultId.equals(vaultId))).get();

  Future<HoldingRow?> findBySymbol(String vaultId, String symbol) {
    return (select(holdings)
          ..where((h) => h.vaultId.equals(vaultId) & h.symbol.equals(symbol)))
        .getSingleOrNull();
  }

  Future<void> upsert(HoldingsCompanion row) =>
      into(holdings).insertOnConflictUpdate(row);

  Future<void> deleteById(String id) =>
      (delete(holdings)..where((h) => h.id.equals(id))).go();
}
