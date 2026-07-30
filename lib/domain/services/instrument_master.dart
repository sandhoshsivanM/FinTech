import '../entities/portfolio.dart';

/// One classification record from the bundled instrument master.
class InstrumentClassification {
  const InstrumentClassification({
    required this.sector,
    required this.industry,
    this.symbol,
    this.isin,
    this.cap,
    this.benchmarkIndexCode,
  });

  final String? symbol;
  final String? isin;
  final String sector;
  final String industry;
  final MarketCapBand? cap;
  final String? benchmarkIndexCode;
}

/// Sector / industry / market-cap lookup, loaded from a bundled versioned asset.
///
/// Deliberately offline: classifying a holding by calling an API would tell that
/// API which stocks you own, which is exactly what this app promises not to do.
/// A bundled table reveals nothing.
///
/// Coverage is partial by design. An unmatched instrument stays unclassified and
/// appears under "Unclassified" in roll-ups rather than being guessed at — an
/// honest gap is more useful than a confident wrong sector.
class InstrumentMaster {
  const InstrumentMaster({
    required this.schemaVersion,
    required this.bySymbol,
    required this.byIsin,
  });

  final int schemaVersion;
  final Map<String, InstrumentClassification> bySymbol;
  final Map<String, InstrumentClassification> byIsin;

  /// An empty master — used when the asset is missing or unreadable, so a bad
  /// asset degrades to "no classification" instead of crashing the app.
  static const empty = InstrumentMaster(
    schemaVersion: 0,
    bySymbol: {},
    byIsin: {},
  );

  int get count => bySymbol.length + byIsin.length;

  factory InstrumentMaster.fromJson(Map<String, dynamic> json) {
    final bySymbol = <String, InstrumentClassification>{};
    final byIsin = <String, InstrumentClassification>{};

    final list = (json['instruments'] as List?) ?? const [];
    for (final raw in list) {
      if (raw is! Map) continue;
      final sector = raw['sector'] as String?;
      final industry = raw['industry'] as String?;
      if (sector == null || industry == null) continue;

      final record = InstrumentClassification(
        symbol: raw['symbol'] as String?,
        isin: raw['isin'] as String?,
        sector: sector,
        industry: industry,
        cap: MarketCapBand.tryFromKey(raw['cap'] as String?),
        benchmarkIndexCode: raw['benchmark'] as String?,
      );

      final symbol = record.symbol;
      final isin = record.isin;
      if (symbol != null && symbol.isNotEmpty) {
        bySymbol[symbol.toUpperCase()] = record;
      }
      if (isin != null && isin.isNotEmpty) {
        byIsin[isin.toUpperCase()] = record;
      }
    }

    return InstrumentMaster(
      schemaVersion: (json['schema_version'] as num?)?.toInt() ?? 0,
      bySymbol: bySymbol,
      byIsin: byIsin,
    );
  }

  /// Looks up a classification. ISIN wins over symbol — it is unambiguous,
  /// whereas a symbol can be reused across exchanges.
  InstrumentClassification? lookup({String? symbol, String? isin}) {
    if (isin != null && isin.isNotEmpty) {
      final hit = byIsin[isin.toUpperCase()];
      if (hit != null) return hit;
    }
    if (symbol != null && symbol.isNotEmpty) {
      return bySymbol[symbol.toUpperCase()];
    }
    return null;
  }
}
