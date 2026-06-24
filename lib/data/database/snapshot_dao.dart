import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'snapshot_dao.g.dart';

@DriftAccessor(tables: [NetWorthSnapshots])
class SnapshotDao extends DatabaseAccessor<AppDatabase> with _$SnapshotDaoMixin {
  SnapshotDao(super.db);

  Stream<List<NetWorthSnapshotRow>> watchForVault(String vaultId) =>
      (select(netWorthSnapshots)
            ..where((s) => s.vaultId.equals(vaultId))
            ..orderBy([(s) => OrderingTerm(expression: s.date)]))
          .watch();

  Future<List<NetWorthSnapshotRow>> allForVault(String vaultId) =>
      (select(netWorthSnapshots)..where((s) => s.vaultId.equals(vaultId))).get();

  Future<void> upsert(NetWorthSnapshotsCompanion row) =>
      into(netWorthSnapshots).insertOnConflictUpdate(row);
}
