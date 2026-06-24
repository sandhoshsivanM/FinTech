import 'package:drift/drift.dart';

import '../../domain/entities/insurance.dart';
import '../../domain/repositories/insurance_repository.dart';
import '../database/app_database.dart';
import '../database/insurance_dao.dart';

class DriftInsuranceRepository implements IInsuranceRepository {
  DriftInsuranceRepository(this._dao);
  final InsuranceDao _dao;

  @override
  Stream<List<Insurance>> watch(String vaultId) =>
      _dao.watchForVault(vaultId).map((rows) => rows.map(_toEntity).toList());

  @override
  Future<List<Insurance>> getAll(String vaultId) async =>
      (await _dao.allForVault(vaultId)).map(_toEntity).toList();

  @override
  Future<void> save(Insurance i) => _dao.upsert(InsurancesCompanion(
        id: Value(i.id),
        vaultId: Value(i.vaultId),
        name: Value(i.name),
        type: Value(i.type.key),
        provider: Value(i.provider),
        coverAmount: Value(i.coverAmount),
        premium: Value(i.premium),
        renewalDate: Value(i.renewalDate?.millisecondsSinceEpoch),
        createdAt: Value(DateTime.now().millisecondsSinceEpoch),
      ));

  @override
  Future<void> delete(String id) => _dao.deleteById(id);

  static Insurance _toEntity(InsuranceRow r) => Insurance(
        id: r.id,
        vaultId: r.vaultId,
        name: r.name,
        type: InsuranceType.fromKey(r.type),
        coverAmount: r.coverAmount,
        premium: r.premium,
        provider: r.provider,
        renewalDate: r.renewalDate == null
            ? null
            : DateTime.fromMillisecondsSinceEpoch(r.renewalDate!),
      );
}
