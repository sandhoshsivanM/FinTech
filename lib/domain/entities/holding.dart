import 'package:decimal/decimal.dart';

/// Asset class — keys match the tax rule engine config (PRD §6A).
enum AssetType {
  equityEtf('equity_etf'),
  debtMf('debt_mf'),
  goldEtf('gold_etf'),
  realEstate('real_estate'),
  crypto('crypto'),
  fd('fd'),
  ppfEpf('ppf_epf'),
  nps('nps');

  const AssetType(this.key);
  final String key;

  static AssetType fromKey(String k) =>
      AssetType.values.firstWhere((a) => a.key == k,
          orElse: () => AssetType.equityEtf);
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
