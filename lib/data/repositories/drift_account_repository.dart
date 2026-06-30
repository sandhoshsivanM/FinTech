import 'package:drift/drift.dart';

import '../../domain/entities/account.dart';
import '../../domain/repositories/account_repository.dart';
import '../database/account_dao.dart';
import '../database/app_database.dart';

class DriftAccountRepository implements IAccountRepository {
  DriftAccountRepository(this._dao);
  final AccountDao _dao;

  @override
  Stream<List<Account>> watch(String vaultId) =>
      _dao.watchForVault(vaultId).map((rows) => rows.map(_toEntity).toList());

  @override
  Future<List<Account>> getAll(String vaultId) async =>
      (await _dao.allForVault(vaultId)).map(_toEntity).toList();

  @override
  Future<void> save(Account a) => _dao.upsert(AccountsCompanion(
        id: Value(a.id),
        vaultId: Value(a.vaultId),
        name: Value(a.name),
        type: Value(a.type.key),
        subtype: Value(a.subtype),
        currency: Value(a.currency),
        openingBalance: Value(a.openingBalance),
        archived: Value(a.archived),
        createdAt: Value(DateTime.now().millisecondsSinceEpoch),
      ));

  @override
  Future<void> delete(String id) => _dao.deleteById(id);

  static Account _toEntity(AccountRow r) => Account(
        id: r.id,
        vaultId: r.vaultId,
        name: r.name,
        type: AccountType.fromKey(r.type),
        subtype: r.subtype,
        currency: r.currency,
        openingBalance: r.openingBalance,
        archived: r.archived,
      );
}
