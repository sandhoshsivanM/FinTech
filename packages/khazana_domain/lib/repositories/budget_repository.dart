import '../entities/budget.dart';

/// Budget repository contract (PRD §3C). Pure domain — no Drift imports.
abstract interface class IBudgetRepository {
  Stream<List<Budget>> watch(String vaultId);
  Future<List<Budget>> getAll(String vaultId);
  Future<void> save(Budget budget);
  Future<void> delete(String id);
}
