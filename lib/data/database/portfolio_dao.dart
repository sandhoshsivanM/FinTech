import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'portfolio_dao.g.dart';

/// Data access for the lot-level portfolio model (Drift v4).
@DriftAccessor(tables: [
  Instruments,
  Trades,
  InstrumentPrices,
  Dividends,
  FundHoldings,
  BenchmarkSeries,
])
class PortfolioDao extends DatabaseAccessor<AppDatabase>
    with _$PortfolioDaoMixin {
  PortfolioDao(super.db);

  // -- Instruments ---------------------------------------------------------

  Stream<List<InstrumentRow>> watchInstruments(String vaultId) =>
      (select(instruments)..where((t) => t.vaultId.equals(vaultId))).watch();

  Future<List<InstrumentRow>> allInstruments(String vaultId) =>
      (select(instruments)..where((t) => t.vaultId.equals(vaultId))).get();

  Future<InstrumentRow?> findInstrumentByIsin(String vaultId, String isin) =>
      (select(instruments)
            ..where((t) => t.vaultId.equals(vaultId) & t.isin.equals(isin))
            ..limit(1))
          .getSingleOrNull();

  Future<InstrumentRow?> findInstrumentBySymbol(
          String vaultId, String symbol) =>
      (select(instruments)
            ..where((t) => t.vaultId.equals(vaultId) & t.symbol.equals(symbol))
            ..limit(1))
          .getSingleOrNull();

  Future<InstrumentRow?> findInstrumentByScheme(
          String vaultId, String schemeCode) =>
      (select(instruments)
            ..where((t) =>
                t.vaultId.equals(vaultId) & t.schemeCode.equals(schemeCode))
            ..limit(1))
          .getSingleOrNull();

  Future<void> upsertInstrument(InstrumentsCompanion row) =>
      into(instruments).insertOnConflictUpdate(row);

  /// Applies bundled classification WITHOUT touching user overrides.
  ///
  /// Only the `*Code` columns are written; `sectorOverride` and
  /// `industryOverride` are left alone, so upgrading the bundled instrument
  /// master can never silently discard a correction the user made.
  Future<void> applyClassification(
    String instrumentId, {
    String? sectorCode,
    String? industryCode,
    String? marketCapBand,
    String? benchmarkIndexCode,
  }) {
    return (update(instruments)..where((t) => t.id.equals(instrumentId)))
        .write(InstrumentsCompanion(
      sectorCode: Value(sectorCode),
      industryCode: Value(industryCode),
      marketCapBand: Value(marketCapBand),
      benchmarkIndexCode: Value(benchmarkIndexCode),
    ));
  }

  Future<void> setSectorOverride(String instrumentId, String? sector) =>
      (update(instruments)..where((t) => t.id.equals(instrumentId)))
          .write(InstrumentsCompanion(sectorOverride: Value(sector)));

  Future<void> setIndustryOverride(String instrumentId, String? industry) =>
      (update(instruments)..where((t) => t.id.equals(instrumentId)))
          .write(InstrumentsCompanion(industryOverride: Value(industry)));

  Future<void> deleteInstrument(String id) async {
    // Children first — the FKs point here.
    await (delete(trades)..where((t) => t.instrumentId.equals(id))).go();
    await (delete(instrumentPrices)..where((t) => t.instrumentId.equals(id)))
        .go();
    await (delete(dividends)..where((t) => t.instrumentId.equals(id))).go();
    await (delete(instruments)..where((t) => t.id.equals(id))).go();
  }

  // -- Trades --------------------------------------------------------------

  Stream<List<TradeRow>> watchTrades(String vaultId) =>
      (select(trades)
            ..where((t) => t.vaultId.equals(vaultId))
            ..orderBy([(t) => OrderingTerm.asc(t.tradeDate)]))
          .watch();

  Future<List<TradeRow>> allTrades(String vaultId) =>
      (select(trades)
            ..where((t) => t.vaultId.equals(vaultId))
            ..orderBy([(t) => OrderingTerm.asc(t.tradeDate)]))
          .get();

  Future<List<TradeRow>> tradesFor(String instrumentId) =>
      (select(trades)
            ..where((t) => t.instrumentId.equals(instrumentId))
            ..orderBy([(t) => OrderingTerm.asc(t.tradeDate)]))
          .get();

  Future<void> upsertTrade(TradesCompanion row) =>
      into(trades).insertOnConflictUpdate(row);

  Future<void> deleteTrade(String id) =>
      (delete(trades)..where((t) => t.id.equals(id))).go();

  Future<void> markReviewed(String id, {bool reviewed = true}) =>
      (update(trades)..where((t) => t.id.equals(id)))
          .write(TradesCompanion(isReviewed: Value(reviewed)));

  /// Count of imported/backfilled rows still awaiting confirmation.
  Future<int> unreviewedCount(String vaultId) async {
    final rows = await (select(trades)
          ..where((t) => t.vaultId.equals(vaultId) & t.isReviewed.equals(false)))
        .get();
    return rows.length;
  }

  // -- Prices --------------------------------------------------------------

  Stream<List<InstrumentPriceRow>> watchPrices(String vaultId) =>
      (select(instrumentPrices)..where((t) => t.vaultId.equals(vaultId)))
          .watch();

  Future<void> insertPrice(InstrumentPricesCompanion row) =>
      into(instrumentPrices).insertOnConflictUpdate(row);

  /// The most recent price per instrument.
  ///
  /// Reduced in Dart rather than SQL because prices are Decimal-in-TEXT, so a
  /// SQL MAX would compare lexicographically (PRD §2 note on the converter).
  Future<Map<String, InstrumentPriceRow>> latestPrices(String vaultId) async {
    final rows = await (select(instrumentPrices)
          ..where((t) => t.vaultId.equals(vaultId)))
        .get();
    final latest = <String, InstrumentPriceRow>{};
    for (final r in rows) {
      final held = latest[r.instrumentId];
      if (held == null || r.asOf > held.asOf) latest[r.instrumentId] = r;
    }
    return latest;
  }

  /// Drops price history older than [keep] points per instrument.
  Future<void> prunePriceHistory(String vaultId, {int keep = 400}) async {
    final rows = await (select(instrumentPrices)
          ..where((t) => t.vaultId.equals(vaultId)))
        .get();
    final byInstrument = <String, List<InstrumentPriceRow>>{};
    for (final r in rows) {
      (byInstrument[r.instrumentId] ??= []).add(r);
    }
    for (final list in byInstrument.values) {
      if (list.length <= keep) continue;
      list.sort((a, b) => b.asOf.compareTo(a.asOf));
      for (final stale in list.skip(keep)) {
        await (delete(instrumentPrices)..where((t) => t.id.equals(stale.id)))
            .go();
      }
    }
  }

  // -- Dividends -----------------------------------------------------------

  Stream<List<DividendRow>> watchDividends(String vaultId) =>
      (select(dividends)
            ..where((t) => t.vaultId.equals(vaultId))
            ..orderBy([(t) => OrderingTerm.desc(t.paidOn)]))
          .watch();

  Future<List<DividendRow>> allDividends(String vaultId) =>
      (select(dividends)..where((t) => t.vaultId.equals(vaultId))).get();

  Future<void> upsertDividend(DividendsCompanion row) =>
      into(dividends).insertOnConflictUpdate(row);

  Future<void> deleteDividend(String id) =>
      (delete(dividends)..where((t) => t.id.equals(id))).go();

  // -- Reference data (bundled) --------------------------------------------

  Future<void> upsertFundHolding(FundHoldingsCompanion row) =>
      into(fundHoldings).insertOnConflictUpdate(row);

  Future<List<FundHoldingRow>> fundHoldingsFor(String schemeCode) =>
      (select(fundHoldings)..where((t) => t.schemeCode.equals(schemeCode)))
          .get();

  Future<List<FundHoldingRow>> allFundHoldings() => select(fundHoldings).get();

  Future<void> upsertBenchmarkPoint(BenchmarkSeriesCompanion row) =>
      into(benchmarkSeries).insertOnConflictUpdate(row);

  Future<List<BenchmarkPointRow>> benchmarkSeriesFor(String indexCode) =>
      (select(benchmarkSeries)
            ..where((t) => t.indexCode.equals(indexCode))
            ..orderBy([(t) => OrderingTerm.asc(t.onDate)]))
          .get();
}
