import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'merchant_alias_dao.g.dart';

@DriftAccessor(tables: [MerchantAliases])
class MerchantAliasDao extends DatabaseAccessor<AppDatabase>
    with _$MerchantAliasDaoMixin {
  MerchantAliasDao(super.db);

  Future<MerchantAliasRow?> findByPattern(String vaultId, String pattern) {
    return (select(merchantAliases)
          ..where(
              (a) => a.vaultId.equals(vaultId) & a.merchantPattern.equals(pattern)))
        .getSingleOrNull();
  }

  Future<void> upsert(MerchantAliasesCompanion row) {
    return into(merchantAliases).insertOnConflictUpdate(row);
  }
}
