import '../entities/insurance.dart';

/// Insurance repository contract. Pure domain — no Drift imports.
abstract interface class IInsuranceRepository {
  Stream<List<Insurance>> watch(String vaultId);
  Future<List<Insurance>> getAll(String vaultId);
  Future<void> save(Insurance insurance);
  Future<void> delete(String id);
}
