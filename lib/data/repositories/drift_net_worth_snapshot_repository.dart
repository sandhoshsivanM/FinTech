import 'package:drift/drift.dart';

import '../../domain/entities/net_worth_snapshot.dart';
import '../../domain/repositories/net_worth_snapshot_repository.dart';
import '../database/app_database.dart';
import '../database/snapshot_dao.dart';

class DriftNetWorthSnapshotRepository implements INetWorthSnapshotRepository {
  DriftNetWorthSnapshotRepository(this._dao);
  final SnapshotDao _dao;

  @override
  Stream<List<NetWorthSnapshot>> watch(String vaultId) =>
      _dao.watchForVault(vaultId).map((rows) => rows.map(_toEntity).toList());

  @override
  Future<List<NetWorthSnapshot>> getAll(String vaultId) async =>
      (await _dao.allForVault(vaultId)).map(_toEntity).toList();

  @override
  Future<void> save(NetWorthSnapshot s) =>
      _dao.upsert(NetWorthSnapshotsCompanion(
        id: Value(s.id),
        vaultId: Value(s.vaultId),
        date: Value(s.date.millisecondsSinceEpoch),
        netWorth: Value(s.netWorth),
        cash: Value(s.cash),
        investments: Value(s.investments),
        liabilities: Value(s.liabilities),
      ));

  static NetWorthSnapshot _toEntity(NetWorthSnapshotRow r) => NetWorthSnapshot(
        id: r.id,
        vaultId: r.vaultId,
        date: DateTime.fromMillisecondsSinceEpoch(r.date),
        netWorth: r.netWorth,
        cash: r.cash,
        investments: r.investments,
        liabilities: r.liabilities,
      );
}
