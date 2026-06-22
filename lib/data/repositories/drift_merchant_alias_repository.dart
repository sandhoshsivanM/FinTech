import 'package:drift/drift.dart';

import '../../domain/repositories/merchant_alias_repository.dart';
import '../database/app_database.dart';
import '../database/merchant_alias_dao.dart';

/// Drift-backed merchant alias learning (PRD §14).
class DriftMerchantAliasRepository implements IMerchantAliasRepository {
  DriftMerchantAliasRepository(this._dao);

  final MerchantAliasDao _dao;

  static String _normalize(String merchant) => merchant.trim().toLowerCase();

  @override
  Future<String?> categoryForMerchant(String vaultId, String merchant) async {
    final row = await _dao.findByPattern(vaultId, _normalize(merchant));
    return row?.categoryId;
  }

  @override
  Future<void> learn(String vaultId, String merchant, String categoryId) async {
    final pattern = _normalize(merchant);
    if (pattern.isEmpty) return;
    final existing = await _dao.findByPattern(vaultId, pattern);
    await _dao.upsert(MerchantAliasesCompanion(
      id: Value(existing?.id ?? '$vaultId:$pattern'),
      vaultId: Value(vaultId),
      merchantPattern: Value(pattern),
      categoryId: Value(categoryId),
      hitCount: Value((existing?.hitCount ?? 0) + 1),
    ));
  }
}
