import 'package:drift/drift.dart';

import '../../domain/entities/liability.dart';
import '../../domain/repositories/liability_repository.dart';
import '../database/app_database.dart';
import '../database/liability_dao.dart';

class DriftLiabilityRepository implements ILiabilityRepository {
  DriftLiabilityRepository(this._dao);
  final LiabilityDao _dao;

  @override
  Stream<List<Liability>> watch(String vaultId) =>
      _dao.watchForVault(vaultId).map((rows) => rows.map(_toEntity).toList());

  @override
  Future<List<Liability>> getAll(String vaultId) async =>
      (await _dao.allForVault(vaultId)).map(_toEntity).toList();

  @override
  Future<void> save(Liability l) => _dao.upsert(LiabilitiesCompanion(
        id: Value(l.id),
        vaultId: Value(l.vaultId),
        name: Value(l.name),
        kind: Value(l.kind.key),
        principal: Value(l.principal),
        aprPct: Value(l.aprPct),
        termMonths: Value(l.termMonths),
        createdAt: Value(DateTime.now().millisecondsSinceEpoch),
      ));

  @override
  Future<void> delete(String id) => _dao.deleteById(id);

  static Liability _toEntity(LiabilityRow r) => Liability(
        id: r.id,
        vaultId: r.vaultId,
        name: r.name,
        kind: LiabilityKind.fromKey(r.kind),
        principal: r.principal,
        aprPct: r.aprPct,
        termMonths: r.termMonths,
      );
}
