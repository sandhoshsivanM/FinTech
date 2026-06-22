import '../entities/transaction.dart';

/// Transaction repository contract (PRD §3C: `ITransactionRepository`).
/// Pure domain — no Drift imports here.
abstract interface class ITransactionRepository {
  Stream<List<Txn>> watch(String vaultId);
  Future<List<Txn>> getAll(String vaultId);
  Future<List<Txn>> getInRange(String vaultId, DateTime start, DateTime end);
  Future<Txn?> getById(String id);
  Future<void> save(Txn txn);
  Future<void> delete(String id);
  Future<int> count(String vaultId);
}
