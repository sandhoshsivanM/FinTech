import 'package:decimal/decimal.dart';

import 'asset_group.dart';
import 'holding.dart';

/// Value types for the lot-level portfolio model (Drift v4).
///
/// Pure Dart, Decimal money — `double` is banned for monetary values (PRD §2).

enum TradeSide {
  buy('buy'),
  sell('sell');

  const TradeSide(this.key);
  final String key;

  static TradeSide fromKey(String k) {
    for (final s in TradeSide.values) {
      if (s.key == k) return s;
    }
    throw ArgumentError.value(k, 'k', 'Unknown TradeSide key');
  }
}

/// Where a row came from. Drives whether it needs review before being trusted.
enum TradeSource {
  manual('manual'),
  csv('csv'),
  cas('cas'),
  cams('cams'),
  api('api'),

  /// Backfilled from the pre-v4 aggregated `Holdings` table.
  legacy('legacy');

  const TradeSource(this.key);
  final String key;

  static TradeSource fromKey(String k) {
    for (final s in TradeSource.values) {
      if (s.key == k) return s;
    }
    throw ArgumentError.value(k, 'k', 'Unknown TradeSource key');
  }
}

/// Market-capitalisation band. Null when unclassified.
enum MarketCapBand {
  large('large', 'Large cap'),
  mid('mid', 'Mid cap'),
  small('small', 'Small cap');

  const MarketCapBand(this.key, this.label);
  final String key;
  final String label;

  static MarketCapBand? tryFromKey(String? k) {
    if (k == null) return null;
    for (final b in MarketCapBand.values) {
      if (b.key == k) return b;
    }
    return null;
  }
}

/// One security ever held.
class Instrument {
  const Instrument({
    required this.id,
    required this.vaultId,
    required this.kind,
    required this.name,
    this.symbol,
    this.isin,
    this.exchange,
    this.amcName,
    this.schemeCode,
    this.sectorCode,
    this.industryCode,
    this.marketCapBand,
    this.sectorOverride,
    this.industryOverride,
    this.currency = 'INR',
    this.benchmarkIndexCode,
  });

  final String id;
  final String vaultId;
  final AssetType kind;
  final String name;
  final String? symbol;
  final String? isin;
  final String? exchange;
  final String? amcName;
  final String? schemeCode;
  final String? sectorCode;
  final String? industryCode;
  final MarketCapBand? marketCapBand;

  /// User corrections. These win over the bundled classification.
  final String? sectorOverride;
  final String? industryOverride;

  final String currency;
  final String? benchmarkIndexCode;

  /// Chart bucket for this instrument.
  AssetGroup get group => AssetGroup.of(kind);

  /// Effective sector: the user's correction if present, else the bundled value.
  String? get sector => sectorOverride ?? sectorCode;

  /// Effective industry: the user's correction if present, else the bundled value.
  String? get industry => industryOverride ?? industryCode;

  /// Ticker with the NSE/BSE suffix used by the price providers (PRD §9).
  /// Null for instruments without a ticker, e.g. mutual funds.
  String? get tickerSymbol =>
      symbol == null ? null : '$symbol${exchange == 'BSE' ? '.BO' : '.NS'}';

  Instrument copyWith({
    String? sectorCode,
    String? industryCode,
    MarketCapBand? marketCapBand,
    String? sectorOverride,
    String? industryOverride,
    String? benchmarkIndexCode,
  }) =>
      Instrument(
        id: id,
        vaultId: vaultId,
        kind: kind,
        name: name,
        symbol: symbol,
        isin: isin,
        exchange: exchange,
        amcName: amcName,
        schemeCode: schemeCode,
        sectorCode: sectorCode ?? this.sectorCode,
        industryCode: industryCode ?? this.industryCode,
        marketCapBand: marketCapBand ?? this.marketCapBand,
        sectorOverride: sectorOverride ?? this.sectorOverride,
        industryOverride: industryOverride ?? this.industryOverride,
        currency: currency,
        benchmarkIndexCode: benchmarkIndexCode ?? this.benchmarkIndexCode,
      );
}

/// A single buy or sell. The source of truth for cost basis.
class Trade {
  // Not const: Decimal.zero is not a compile-time constant, so the charge
  // defaults are applied in the initialiser list.
  Trade({
    required this.id,
    required this.vaultId,
    required this.instrumentId,
    required this.side,
    required this.quantity,
    required this.pricePerUnit,
    required this.tradeDate,
    this.accountId,
    Decimal? brokerage,
    Decimal? stt,
    Decimal? stampDuty,
    Decimal? gst,
    Decimal? otherCharges,
    this.folioNumber,
    this.source = TradeSource.manual,
    this.confidence,
    this.isReviewed = false,
  })  : brokerage = brokerage ?? Decimal.zero,
        stt = stt ?? Decimal.zero,
        stampDuty = stampDuty ?? Decimal.zero,
        gst = gst ?? Decimal.zero,
        otherCharges = otherCharges ?? Decimal.zero;

  final String id;
  final String vaultId;
  final String instrumentId;
  final String? accountId;
  final TradeSide side;
  final Decimal quantity;
  final Decimal pricePerUnit;
  final DateTime tradeDate;

  final Decimal brokerage;
  final Decimal stt;
  final Decimal stampDuty;
  final Decimal gst;
  final Decimal otherCharges;

  final String? folioNumber;
  final TradeSource source;
  final int? confidence;
  final bool isReviewed;

  /// Total transaction charges.
  Decimal get charges => brokerage + stt + stampDuty + gst + otherCharges;

  /// Gross consideration, before charges.
  Decimal get gross => quantity * pricePerUnit;

  /// What a buy actually cost, or what a sell actually netted.
  ///
  /// Charges always work against you: they add to what you paid on a buy and
  /// subtract from what you received on a sell. Getting this sign wrong is the
  /// classic way a portfolio's P&L reads better than reality.
  Decimal get netAmount =>
      side == TradeSide.buy ? gross + charges : gross - charges;
}

/// A dated price observation.
class InstrumentPrice {
  const InstrumentPrice({
    required this.instrumentId,
    required this.asOf,
    required this.price,
    required this.source,
  });

  final String instrumentId;
  final DateTime asOf;
  final Decimal price;

  /// manual | amfi | yahoo | alphavantage | twelvedata | cache | legacy
  final String source;
}

/// A dividend or mutual-fund payout.
class Dividend {
  Dividend({
    required this.id,
    required this.vaultId,
    required this.instrumentId,
    required this.paidOn,
    required this.amount,
    Decimal? taxDeducted,
    this.kind = 'dividend',
    this.txnId,
  }) : taxDeducted = taxDeducted ?? Decimal.zero;

  final String id;
  final String vaultId;
  final String instrumentId;
  final DateTime paidOn;
  final Decimal amount;
  final Decimal taxDeducted;
  final String kind;
  final String? txnId;

  /// What actually reached you.
  Decimal get netAmount => amount - taxDeducted;
}
