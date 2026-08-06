import 'package:drift/drift.dart';

import '../../domain/entities/holding.dart';
import '../../domain/entities/portfolio.dart';
import '../database/app_database.dart';
import '../database/portfolio_dao.dart';

/// Maps the lot-level Drift rows to and from domain entities.
class DriftPortfolioRepository {
  DriftPortfolioRepository(this._dao);

  final PortfolioDao _dao;

  // -- Reads ---------------------------------------------------------------

  Future<List<Instrument>> instruments(String vaultId) async {
    final rows = await _dao.allInstruments(vaultId);
    return rows.map(_toInstrument).toList();
  }

  Stream<List<Instrument>> watchInstruments(String vaultId) =>
      _dao.watchInstruments(vaultId).map((rows) => rows.map(_toInstrument).toList());

  Future<List<Trade>> trades(String vaultId) async {
    final rows = await _dao.allTrades(vaultId);
    return rows.map(_toTrade).toList();
  }

  Stream<List<Trade>> watchTrades(String vaultId) =>
      _dao.watchTrades(vaultId).map((rows) => rows.map(_toTrade).toList());

  Future<Map<String, InstrumentPrice>> latestPrices(String vaultId) async {
    final rows = await _dao.latestPrices(vaultId);
    return rows.map((k, v) => MapEntry(k, _toPrice(v)));
  }

  Future<List<Dividend>> dividends(String vaultId) async {
    final rows = await _dao.allDividends(vaultId);
    return rows.map(_toDividend).toList();
  }

  Future<int> unreviewedCount(String vaultId) => _dao.unreviewedCount(vaultId);

  // -- Writes --------------------------------------------------------------

  Future<void> saveInstrument(Instrument i) {
    return _dao.upsertInstrument(InstrumentsCompanion.insert(
      id: i.id,
      vaultId: i.vaultId,
      kind: i.kind.key,
      name: i.name,
      symbol: Value(i.symbol),
      isin: Value(i.isin),
      exchange: Value(i.exchange),
      amcName: Value(i.amcName),
      schemeCode: Value(i.schemeCode),
      sectorCode: Value(i.sectorCode),
      industryCode: Value(i.industryCode),
      marketCapBand: Value(i.marketCapBand?.key),
      sectorOverride: Value(i.sectorOverride),
      industryOverride: Value(i.industryOverride),
      currency: Value(i.currency),
      benchmarkIndexCode: Value(i.benchmarkIndexCode),
      createdAt: DateTime.now().millisecondsSinceEpoch,
    ));
  }

  Future<void> saveTrade(Trade t) {
    return _dao.upsertTrade(TradesCompanion.insert(
      id: t.id,
      vaultId: t.vaultId,
      instrumentId: t.instrumentId,
      accountId: Value(t.accountId),
      side: t.side.key,
      quantity: t.quantity,
      pricePerUnit: t.pricePerUnit,
      brokerage: Value(t.brokerage),
      stt: Value(t.stt),
      stampDuty: Value(t.stampDuty),
      gst: Value(t.gst),
      otherCharges: Value(t.otherCharges),
      tradeDate: t.tradeDate.millisecondsSinceEpoch,
      folioNumber: Value(t.folioNumber),
      source: Value(t.source.key),
      confidence: Value(t.confidence),
      isReviewed: Value(t.isReviewed),
      createdAt: DateTime.now().millisecondsSinceEpoch,
    ));
  }

  Future<void> deleteTrade(String id) => _dao.deleteTrade(id);

  Future<void> deleteInstrument(String id) => _dao.deleteInstrument(id);

  Future<void> markReviewed(String tradeId, {bool reviewed = true}) =>
      _dao.markReviewed(tradeId, reviewed: reviewed);

  Future<void> setSectorOverride(String instrumentId, String? sector) =>
      _dao.setSectorOverride(instrumentId, sector);

  Future<void> setIndustryOverride(String instrumentId, String? industry) =>
      _dao.setIndustryOverride(instrumentId, industry);

  Future<void> applyClassification(
    String instrumentId, {
    String? sectorCode,
    String? industryCode,
    String? marketCapBand,
    String? benchmarkIndexCode,
  }) =>
      _dao.applyClassification(
        instrumentId,
        sectorCode: sectorCode,
        industryCode: industryCode,
        marketCapBand: marketCapBand,
        benchmarkIndexCode: benchmarkIndexCode,
      );

  /// The price each instrument carried before its current one, for day-change.
  Future<Map<String, InstrumentPrice>> previousPrices(String vaultId) async {
    final rows = await _dao.previousPrices(vaultId);
    return {
      for (final e in rows.entries)
        e.key: InstrumentPrice(
          instrumentId: e.value.instrumentId,
          asOf: DateTime.fromMillisecondsSinceEpoch(e.value.asOf),
          price: e.value.price,
          source: e.value.source,
        ),
    };
  }

  Future<void> recordPrice({
    required String vaultId,
    required String instrumentId,
    required InstrumentPrice price,
  }) {
    // One point per instrument per source per timestamp, so a repeated refresh
    // in the same moment updates rather than piling up duplicates.
    final id = '$instrumentId-${price.source}-${price.asOf.millisecondsSinceEpoch}';
    return _dao.insertPrice(InstrumentPricesCompanion.insert(
      id: id,
      vaultId: vaultId,
      instrumentId: instrumentId,
      asOf: price.asOf.millisecondsSinceEpoch,
      price: price.price,
      source: price.source,
    ));
  }

  Future<void> saveDividend(Dividend d) {
    return _dao.upsertDividend(DividendsCompanion.insert(
      id: d.id,
      vaultId: d.vaultId,
      instrumentId: d.instrumentId,
      paidOn: d.paidOn.millisecondsSinceEpoch,
      amount: d.amount,
      taxDeducted: Value(d.taxDeducted),
      kind: Value(d.kind),
      txnId: Value(d.txnId),
    ));
  }

  Future<void> deleteDividend(String id) => _dao.deleteDividend(id);

  Future<List<FundHoldingRow>> fundHoldingsFor(String schemeCode) =>
      _dao.fundHoldingsFor(schemeCode);

  Future<List<FundHoldingRow>> allFundHoldings() => _dao.allFundHoldings();

  Future<void> saveFundHolding({
    required String schemeCode,
    required String underlyingIsin,
    required int weightBps,
    required DateTime asOf,
  }) =>
      _dao.upsertFundHolding(FundHoldingsCompanion.insert(
        id: '$schemeCode-$underlyingIsin',
        schemeCode: schemeCode,
        underlyingIsin: underlyingIsin,
        weightBps: weightBps,
        asOf: asOf.millisecondsSinceEpoch,
      ));

  // -- Mapping -------------------------------------------------------------

  Instrument _toInstrument(InstrumentRow r) => Instrument(
        id: r.id,
        vaultId: r.vaultId,
        // tryFromKey, not fromKey: a single unrecognised row must not take the
        // whole portfolio screen down. Unknown kinds fall back to the group-less
        // 'cash' bucket only after being surfaced by the loud fromKey elsewhere.
        kind: AssetType.tryFromKey(r.kind) ?? AssetType.equityEtf,
        name: r.name,
        symbol: r.symbol,
        isin: r.isin,
        exchange: r.exchange,
        amcName: r.amcName,
        schemeCode: r.schemeCode,
        sectorCode: r.sectorCode,
        industryCode: r.industryCode,
        marketCapBand: MarketCapBand.tryFromKey(r.marketCapBand),
        sectorOverride: r.sectorOverride,
        industryOverride: r.industryOverride,
        currency: r.currency,
        benchmarkIndexCode: r.benchmarkIndexCode,
      );

  Trade _toTrade(TradeRow r) => Trade(
        id: r.id,
        vaultId: r.vaultId,
        instrumentId: r.instrumentId,
        accountId: r.accountId,
        side: TradeSide.fromKey(r.side),
        quantity: r.quantity,
        pricePerUnit: r.pricePerUnit,
        tradeDate: DateTime.fromMillisecondsSinceEpoch(r.tradeDate),
        brokerage: r.brokerage,
        stt: r.stt,
        stampDuty: r.stampDuty,
        gst: r.gst,
        otherCharges: r.otherCharges,
        folioNumber: r.folioNumber,
        source: TradeSource.fromKey(r.source),
        confidence: r.confidence,
        isReviewed: r.isReviewed,
      );

  InstrumentPrice _toPrice(InstrumentPriceRow r) => InstrumentPrice(
        instrumentId: r.instrumentId,
        asOf: DateTime.fromMillisecondsSinceEpoch(r.asOf),
        price: r.price,
        source: r.source,
      );

  Dividend _toDividend(DividendRow r) => Dividend(
        id: r.id,
        vaultId: r.vaultId,
        instrumentId: r.instrumentId,
        paidOn: DateTime.fromMillisecondsSinceEpoch(r.paidOn),
        amount: r.amount,
        taxDeducted: r.taxDeducted,
        kind: r.kind,
        txnId: r.txnId,
      );
}
