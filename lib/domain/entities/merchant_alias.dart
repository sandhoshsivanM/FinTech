/// A learned merchant → category mapping (PRD §14 merchant alias learning).
class MerchantAlias {
  const MerchantAlias({
    required this.id,
    required this.vaultId,
    required this.merchantPattern,
    required this.categoryId,
    this.hitCount = 1,
  });

  final String id;
  final String vaultId;
  final String merchantPattern; // normalized lowercase merchant
  final String categoryId;
  final int hitCount;
}
