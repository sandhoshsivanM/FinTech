import 'dart:convert';

import 'package:decimal/decimal.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../../../core/di/data_providers.dart';
import '../../../data/repositories/drift_portfolio_repository.dart';
import '../../../domain/entities/holding.dart';
import '../../../domain/entities/investment_totals.dart';
import '../../../domain/entities/portfolio.dart';
import '../../../domain/services/instrument_master.dart';
import '../../../domain/services/portfolio_analytics.dart';
import '../data/amfi_nav_provider.dart';
import '../services/price_refresh_service.dart';
import '../../settings/providers/fx_providers.dart';
import 'investment_providers.dart' show marketDataServiceProvider;

const _uuid = Uuid();

final portfolioRepositoryProvider = Provider<DriftPortfolioRepository>((ref) {
  return DriftPortfolioRepository(ref.watch(databaseProvider).portfolioDao);
});

const portfolioAnalytics = PortfolioAnalytics();

/// The bundled sector / industry / market-cap table.
///
/// A missing or malformed asset degrades to [InstrumentMaster.empty] — holdings
/// then read as "Unclassified" instead of the screen failing.
final instrumentMasterProvider = FutureProvider<InstrumentMaster>((ref) async {
  try {
    final raw = await rootBundle.loadString('assets/instrument_master.json');
    return InstrumentMaster.fromJson(
        jsonDecode(raw) as Map<String, dynamic>);
  } on Object {
    return InstrumentMaster.empty;
  }
});

final instrumentsProvider = StreamProvider<List<Instrument>>((ref) {
  return ref
      .watch(portfolioRepositoryProvider)
      .watchInstruments(ref.watch(currentVaultIdProvider));
});

final tradesProvider = StreamProvider<List<Trade>>((ref) {
  return ref
      .watch(portfolioRepositoryProvider)
      .watchTrades(ref.watch(currentVaultIdProvider));
});

/// The whole portfolio: positions, cost basis, realised and unrealised P&L.
///
/// Rebuilds whenever instruments or trades change. Prices and dividends are
/// fetched per build rather than streamed because they change far less often
/// than the streams above fire.
final portfolioSnapshotProvider =
    FutureProvider<PortfolioSnapshot>((ref) async {
  final repo = ref.watch(portfolioRepositoryProvider);
  final vaultId = ref.watch(currentVaultIdProvider);

  final instruments = await ref.watch(instrumentsProvider.future);
  final trades = await ref.watch(tradesProvider.future);
  final prices = await repo.latestPrices(vaultId);
  final divs = await repo.dividends(vaultId);

  return portfolioAnalytics.snapshot(
    instruments: instruments,
    trades: trades,
    latestPrices: prices,
    dividends: divs,
  );
});

/// What the portfolio is worth, for every consumer outside this feature.
///
/// Dashboard tiles, the health score, the safety net, account net worth and the
/// daily snapshot all read this and nothing else. That is the whole point: those
/// five used to sum the legacy `Holdings` table independently while the
/// Investments screen read the lot model, so the app showed two different
/// answers to "what are my investments worth" depending on which screen you
/// were looking at.
///
/// Stays an [AsyncValue] deliberately. Collapsing loading to
/// [InvestmentTotals.empty] would tell the health score there are no
/// investments, dropping the score on every cold open until the streams
/// resolve — a fabricated number, which is exactly what this work is removing.
final investmentTotalsProvider = Provider<AsyncValue<InvestmentTotals>>((ref) {
  // Foreign holdings are converted into the base currency here, once, so no
  // consumer has to think about FX. Anything with no stored rate is excluded
  // and named in `unconvertedCurrencies` rather than counted at parity.
  final base = ref.watch(baseCurrencyProvider);
  final rateFor = ref.watch(fxLookupProvider);
  return ref.watch(portfolioSnapshotProvider).whenData(
        (snap) => InvestmentTotals.fromSnapshot(
          snap,
          baseCurrency: base,
          rateFor: rateFor,
        ),
      );
});

/// Which dimension the breakdown screen is grouping by.
final rollupDimensionProvider =
    StateProvider<RollupDimension>((ref) => RollupDimension.sector);

/// Rows for the currently selected dimension.
final rollupProvider = Provider<List<RollupRow>>((ref) {
  final snap = ref.watch(portfolioSnapshotProvider).valueOrNull;
  if (snap == null) return const [];
  return portfolioAnalytics.rollup(
      snap.positions, ref.watch(rollupDimensionProvider));
});

/// Allocation in the fixed chart order (never value-sorted — see
/// [PortfolioAnalytics.allocationByGroup]).
final allocationProvider = Provider<List<RollupRow>>((ref) {
  final snap = ref.watch(portfolioSnapshotProvider).valueOrNull;
  if (snap == null) return const [];
  return portfolioAnalytics.allocationByGroup(snap.positions);
});

/// Unclassified market value, and its share of the portfolio.
///
/// The bundled classification table covers a starter set of Indian large caps,
/// so a real portfolio can land largely in "Unclassified". The sunburst says so
/// in its caption rather than quietly rendering one grey wedge and calling it a
/// breakdown.
final unclassifiedShareProvider = Provider<double?>((ref) {
  final snap = ref.watch(portfolioSnapshotProvider).valueOrNull;
  if (snap == null || snap.marketValue <= Decimal.zero) return null;
  final rows = portfolioAnalytics.rollup(snap.positions, RollupDimension.sector);
  final unclassified = rows
      .where((r) => r.key == unclassifiedKey)
      .fold(Decimal.zero, (s, r) => s + r.marketValue);
  if (unclassified <= Decimal.zero) return null;
  return (unclassified / snap.marketValue).toDouble();
});

/// Portfolio XIRR, or null when it cannot be solved.
final portfolioXirrProvider = FutureProvider<double?>((ref) async {
  final repo = ref.watch(portfolioRepositoryProvider);
  final vaultId = ref.watch(currentVaultIdProvider);
  final snap = await ref.watch(portfolioSnapshotProvider.future);
  final trades = await ref.watch(tradesProvider.future);
  final divs = await repo.dividends(vaultId);

  return portfolioAnalytics.xirr(
    trades: trades,
    dividends: divs,
    currentValue: snap.marketValue,
    asOf: DateTime.now(),
  );
});

/// How many imported or backfilled lots still need confirming.
final unreviewedLotCountProvider = FutureProvider<int>((ref) async {
  // Depend on trades so the badge updates as rows are reviewed.
  await ref.watch(tradesProvider.future);
  return ref
      .watch(portfolioRepositoryProvider)
      .unreviewedCount(ref.watch(currentVaultIdProvider));
});

/// Refreshes prices from AMFI (funds) and the ticker chain (equities/ETFs).
///
/// A `FutureProvider` because the market-data chain reads stored API keys.
/// Nothing calls it on build — see [PriceRefreshService]'s note on this being
/// the app's only outbound call and firing only when the user asks.
final priceRefreshServiceProvider =
    FutureProvider<PriceRefreshService>((ref) async {
  return PriceRefreshService(
    repo: ref.watch(portfolioRepositoryProvider),
    vaultId: ref.watch(currentVaultIdProvider),
    marketData: await ref.watch(marketDataServiceProvider.future),
    amfi: AmfiNavProvider(),
  );
});

/// Mutations for the lot-level portfolio.
class PortfolioActions {
  PortfolioActions(this._repo, this._vaultId, this._master);

  final DriftPortfolioRepository _repo;
  final String _vaultId;
  final InstrumentMaster _master;

  /// Creates (or reuses) an instrument, applying bundled classification.
  ///
  /// Matching prefers ISIN, then scheme code, then symbol — the same precedence
  /// the importers use, so a manual entry and an import converge on one row
  /// instead of creating duplicates.
  Future<Instrument> ensureInstrument({
    required String name,
    required AssetType kind,
    String? symbol,
    String? isin,
    String? exchange,
    String? schemeCode,
    String? amcName,
    String currency = 'INR',
  }) async {
    final existing = await _repo.instruments(_vaultId);
    Instrument? match;
    if (isin != null && isin.isNotEmpty) {
      match = existing.firstWhereOrNull((i) => i.isin == isin);
    }
    match ??= (schemeCode != null && schemeCode.isNotEmpty)
        ? existing.firstWhereOrNull((i) => i.schemeCode == schemeCode)
        : null;
    match ??= (symbol != null && symbol.isNotEmpty)
        ? existing.firstWhereOrNull(
            (i) => i.symbol == symbol && i.exchange == exchange)
        : null;
    if (match != null) return match;

    final cls = _master.lookup(symbol: symbol, isin: isin);
    final instrument = Instrument(
      id: _uuid.v4(),
      vaultId: _vaultId,
      kind: kind,
      name: name,
      symbol: symbol,
      isin: isin,
      exchange: exchange,
      schemeCode: schemeCode,
      amcName: amcName,
      sectorCode: cls?.sector,
      industryCode: cls?.industry,
      marketCapBand: cls?.cap,
      benchmarkIndexCode: cls?.benchmarkIndexCode,
      currency: currency,
    );
    await _repo.saveInstrument(instrument);
    return instrument;
  }

  Future<void> addTrade(Trade t) => _repo.saveTrade(t);

  Future<void> deleteTrade(String id) => _repo.deleteTrade(id);

  Future<void> deleteInstrument(String id) => _repo.deleteInstrument(id);

  Future<void> markReviewed(String tradeId, {bool reviewed = true}) =>
      _repo.markReviewed(tradeId, reviewed: reviewed);

  Future<void> setSectorOverride(String instrumentId, String? sector) =>
      _repo.setSectorOverride(instrumentId, sector);

  Future<void> recordManualPrice({
    required String instrumentId,
    required Decimal price,
    DateTime? asOf,
  }) =>
      _repo.recordPrice(
        vaultId: _vaultId,
        instrumentId: instrumentId,
        price: InstrumentPrice(
          instrumentId: instrumentId,
          asOf: asOf ?? DateTime.now(),
          price: price,
          source: 'manual',
        ),
      );

  Future<void> addDividend({
    required String instrumentId,
    required Decimal amount,
    required DateTime paidOn,
    Decimal? taxDeducted,
  }) =>
      _repo.saveDividend(Dividend(
        id: _uuid.v4(),
        vaultId: _vaultId,
        instrumentId: instrumentId,
        paidOn: paidOn,
        amount: amount,
        taxDeducted: taxDeducted,
      ));

  /// Re-applies bundled classification to every instrument.
  ///
  /// Only the bundled `*Code` columns are written; user overrides survive. Run
  /// after upgrading `assets/instrument_master.json`.
  Future<int> reclassifyAll() async {
    final all = await _repo.instruments(_vaultId);
    var updated = 0;
    for (final i in all) {
      final cls = _master.lookup(symbol: i.symbol, isin: i.isin);
      if (cls == null) continue;
      await _repo.applyClassification(
        i.id,
        sectorCode: cls.sector,
        industryCode: cls.industry,
        marketCapBand: cls.cap?.key,
        benchmarkIndexCode: cls.benchmarkIndexCode,
      );
      updated++;
    }
    return updated;
  }
}

final portfolioActionsProvider = Provider<PortfolioActions>((ref) {
  return PortfolioActions(
    ref.watch(portfolioRepositoryProvider),
    ref.watch(currentVaultIdProvider),
    ref.watch(instrumentMasterProvider).valueOrNull ?? InstrumentMaster.empty,
  );
});

extension _FirstWhereOrNull<E> on Iterable<E> {
  E? firstWhereOrNull(bool Function(E) test) {
    for (final e in this) {
      if (test(e)) return e;
    }
    return null;
  }
}

/// When the user last ran a price refresh on this device.
///
/// Distinct from any price's own `asOf`: a run that reaches every provider and
/// finds nothing newer still counts as "checked". Without this, a portfolio
/// whose prices are all a week old is indistinguishable from one that was
/// checked a minute ago and genuinely has not moved.
///
/// Stored in preferences, not the keychain — a timestamp is not a secret, and
/// reading it must not cost an OS password prompt.
final lastPriceRefreshProvider =
    FutureProvider<DateTime?>((ref) async {
  final prefs = await SharedPreferences.getInstance();
  final ms = prefs.getInt(_lastRefreshKey(ref.watch(currentVaultIdProvider)));
  return ms == null ? null : DateTime.fromMillisecondsSinceEpoch(ms);
});

String _lastRefreshKey(String vaultId) => 'prices_last_refresh_$vaultId';

/// Records that a refresh ran. Call after the service returns, success or not:
/// "we checked and nothing came back" is exactly what the user needs to know.
///
/// Takes the vault id rather than a `Ref` so widgets (which hold a `WidgetRef`)
/// and providers can both call it.
Future<void> recordPriceRefresh(String vaultId) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setInt(
      _lastRefreshKey(vaultId), DateTime.now().millisecondsSinceEpoch);
}
