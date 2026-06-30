import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'account_dao.g.dart';

@DriftAccessor(tables: [Accounts])
class AccountDao extends DatabaseAccessor<AppDatabase> with _$AccountDaoMixin {
  AccountDao(super.db);

  Stream<List<AccountRow>> watchForVault(String vaultId) =>
      (select(accounts)..where((a) => a.vaultId.equals(vaultId))).watch();

  Future<List<AccountRow>> allForVault(String vaultId) =>
      (select(accounts)..where((a) => a.vaultId.equals(vaultId))).get();

  Future<void> upsert(AccountsCompanion row) =>
      into(accounts).insertOnConflictUpdate(row);

  Future<void> deleteById(String id) =>
      (delete(accounts)..where((a) => a.id.equals(id))).go();
}
