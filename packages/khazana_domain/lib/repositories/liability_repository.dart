import '../entities/liability.dart';

/// Liability repository contract (PRD §3C). Pure domain — no Drift imports.
abstract interface class ILiabilityRepository {
  Stream<List<Liability>> watch(String vaultId);
  Future<List<Liability>> getAll(String vaultId);
  Future<void> save(Liability liability);
  Future<void> delete(String id);
}
