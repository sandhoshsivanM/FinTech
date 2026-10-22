import 'package:decimal/decimal.dart';

/// Asset class — keys match the tax rule engine config (PRD §6A).
///
/// Every member MUST have a matching entry in `assets/tax_rules.json` (keyed by
/// [key]) or gain computation throws, and a matching entry in the web app's
/// `ASSET_META` so the two clients agree on labels and colours.
enum AssetType {
  equityEtf('equity_etf', 'Equity / ETF'),
  equityMf('equity_mf', 'Equity MF'),
  debtMf('debt_mf', 'Debt MF'),
  goldEtf('gold_etf', 'Gold'),
  bond('bond', 'Bonds'),
  cash('cash', 'Cash'),
  realEstate('real_estate', 'Real Estate'),
  crypto('crypto', 'Crypto'),
  fd('fd', 'Fixed Deposit'),
  ppfEpf('ppf_epf', 'PPF / EPF'),
  nps('nps', 'NPS'),
  ssy('ssy', 'Sukanya Samriddhi'),
  sgb('sgb', 'Sovereign Gold Bond'),
  ulip('ulip', 'ULIP');

  const AssetType(this.key, this.label);

  /// Stable storage key. Also the key in `assets/tax_rules.json`.
  final String key;

  /// Human-readable name. Single source of truth — do not re-list these in UI
  /// code, which is how the web and Flutter labels drifted apart before.
  final String label;

  /// Parses a stored key. Throws [ArgumentError] on an unrecognised value.
  ///
  /// This deliberately fails loudly. It previously fell back to [equityEtf],
  /// which silently misfiled anything it didn't recognise as equity — so a row
  /// written by a newer build (say `equity_mf`) would be read back by an older
  /// build as equity and taxed at the wrong rate. A crash is recoverable; wrong
  /// capital-gains numbers presented as correct are not.
  static AssetType fromKey(String k) {
    final match = tryFromKey(k);
    if (match == null) {
      throw ArgumentError.value(k, 'k', 'Unknown AssetType key');
    }
    return match;
  }

  /// Parses a stored key, returning null when unrecognised. Use this where a
  /// bad value should be surfaced to the user rather than thrown.
  static AssetType? tryFromKey(String k) {
    for (final a in AssetType.values) {
      if (a.key == k) return a;
    }
    return null;
  }
}

/// A portfolio holding (PRD §14 portfolio import). Pure Dart — Decimal money.
class Holding {
  const Holding({
    required this.id,
    required this.vaultId,
    required this.symbol,
    required this.exchange,
    required this.quantity,
    required this.avgCost,
    required this.firstPurchaseDate,
    this.assetType = AssetType.equityEtf,
    this.currency = 'INR',
    this.lastPrice,
  });

  final String id;
  final String vaultId;
  final String symbol; // e.g. 'INFY'
  final String exchange; // 'NSE' / 'BSE'
  final Decimal quantity;
  final Decimal avgCost; // per-unit cost
  final DateTime firstPurchaseDate;
  final AssetType assetType;
  final String currency;
  final Decimal? lastPrice; // latest fetched price, null until fetched

  /// Total invested = quantity × avgCost.
  Decimal get investedValue => quantity * avgCost;

  /// Current market value = quantity × lastPrice (falls back to invested).
  Decimal get marketValue =>
      lastPrice == null ? investedValue : quantity * lastPrice!;

  /// Unrealised P&L = marketValue − invested.
  Decimal get unrealisedPnl => marketValue - investedValue;

  /// Ticker with NSE/BSE suffix (PRD §9: .NS / .BO).
  String get tickerSymbol =>
      '$symbol${exchange == 'BSE' ? '.BO' : '.NS'}';

  Holding copyWith({
    Decimal? quantity,
    Decimal? avgCost,
    Decimal? lastPrice,
    AssetType? assetType,
  }) {
    return Holding(
      id: id,
      vaultId: vaultId,
      symbol: symbol,
      exchange: exchange,
      quantity: quantity ?? this.quantity,
      avgCost: avgCost ?? this.avgCost,
      firstPurchaseDate: firstPurchaseDate,
      assetType: assetType ?? this.assetType,
      currency: currency,
      lastPrice: lastPrice ?? this.lastPrice,
    );
  }
}
