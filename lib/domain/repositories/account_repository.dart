import '../entities/account.dart';

/// Chart-of-accounts repository contract. Pure domain — no Drift imports.
abstract interface class IAccountRepository {
  Stream<List<Account>> watch(String vaultId);
  Future<List<Account>> getAll(String vaultId);
  Future<void> save(Account account);
  Future<void> delete(String id);
}
