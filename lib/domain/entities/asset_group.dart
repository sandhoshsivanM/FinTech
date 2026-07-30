import 'holding.dart';

/// Chart-facing buckets. The eleven [AssetType] values collapse to seven groups.
///
/// Why this exists: eleven categorical hues cannot be kept colourblind-separable,
/// so charts colour by *group*, never by asset type. Asset type still drives
/// labelled chips and tax rules, where the text always accompanies the colour.
///
/// Mirrors `AssetGroup` / `ASSET_GROUP_OF` in `webapp/src/domain/portfolio.ts` —
/// keep the two in sync.
enum AssetGroup {
  equity('Equity'),
  debt('Debt'),
  gold('Gold'),
  realEstate('Real Estate'),
  retirement('Retirement'),
  crypto('Crypto'),
  cash('Cash');

  const AssetGroup(this.label);

  /// Human-readable group name.
  final String label;

  /// The group an asset type belongs to.
  static AssetGroup of(AssetType t) => switch (t) {
        AssetType.equityEtf || AssetType.equityMf => AssetGroup.equity,
        AssetType.debtMf || AssetType.bond => AssetGroup.debt,
        AssetType.goldEtf => AssetGroup.gold,
        AssetType.realEstate => AssetGroup.realEstate,
        AssetType.fd || AssetType.ppfEpf || AssetType.nps =>
          AssetGroup.retirement,
        AssetType.crypto => AssetGroup.crypto,
        AssetType.cash => AssetGroup.cash,
      };
}

/// Fixed render order for charts.
///
/// This order IS the colourblind-safety mechanism, not cosmetics. On this fixed
/// adjacent pairlist the group palette clears every gate (worst adjacent CVD
/// ΔE 9.1 protan, worst normal-vision ΔE 19.6). Re-ordered freely — for example
/// by sorting slices largest-first — it fails hard: worst pair ΔE 3.2 under
/// protanopia. So charts must render groups in this order and must NOT sort by
/// value. Enum declaration order is the source of truth.
const kAssetGroupOrder = AssetGroup.values;
