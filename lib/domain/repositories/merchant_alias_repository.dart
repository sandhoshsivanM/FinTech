/// Merchant alias learning contract (PRD §14). Pure domain — no Drift imports.
abstract interface class IMerchantAliasRepository {
  /// Returns the learned category id for [merchant], or null if unknown.
  Future<String?> categoryForMerchant(String vaultId, String merchant);

  /// Records that [merchant] was categorized as [categoryId], incrementing
  /// the confidence (hit count) if already known.
  Future<void> learn(String vaultId, String merchant, String categoryId);
}
