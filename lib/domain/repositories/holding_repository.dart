import '../entities/holding.dart';

/// Holding repository contract (PRD §3C). Pure domain — no Drift imports.
abstract interface class IHoldingRepository {
  Stream<List<Holding>> watch(String vaultId);
  Future<List<Holding>> getAll(String vaultId);
  Future<Holding?> getBySymbol(String vaultId, String symbol);
  Future<void> save(Holding holding);
  Future<void> delete(String id);
}
