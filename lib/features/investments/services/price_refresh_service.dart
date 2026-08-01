import 'package:decimal/decimal.dart';

import '../../../domain/entities/holding.dart';
import '../../../domain/entities/portfolio.dart';
import '../../../domain/services/market_data.dart';
import '../../../data/repositories/drift_portfolio_repository.dart';
import '../data/amfi_nav_provider.dart';

/// What a refresh run did, in enough detail for the UI to be honest about it.
class PriceRefreshResult {
  const PriceRefreshResult({
    required this.updated,
    required this.skipped,
    required this.bySource,
    required this.failures,
    this.oldestAsOf,
  });

  /// Instruments that got a new price.
  final int updated;

  /// Instruments no provider can price — bonds, FDs, PPF, real estate. Not a
  /// failure: there is no free live source for them, and reporting them as
  /// errors would train the user to ignore real errors.
  final int skipped;

  final Map<PriceSource, int> bySource;

  /// Instrument names a provider was asked about and could not answer for.
  final List<String> failures;

  /// The oldest `asOf` among the prices written. Mutual funds legitimately lag
  /// a day, so a run can succeed completely and still leave the portfolio
  /// carrying yesterday's numbers — which the UI should say.
  final DateTime? oldestAsOf;

  bool get didNothing => updated == 0;
}

/// Refreshes instrument prices and writes them to [InstrumentPrices].
///
/// Replaces `PortfolioImporter.refreshPrices`, which wrote to the legacy
/// `Holdings.lastPrice` — an undated column, so a price fetched three weeks ago
/// was indistinguishable from one fetched a minute ago. Every price this writes
/// carries the date the *source* reported, not the time the app happened to ask.
///
/// **User-initiated only.** There is no scheduler and no refresh-on-open: this
/// is the app's only outbound network call, and the threat model commits to it
/// happening when the user asks and not otherwise.
class PriceRefreshService {
  PriceRefreshService({
    required DriftPortfolioRepository repo,
    required String vaultId,
    required MarketDataService marketData,
    AmfiNavProvider? amfi,
  })  : _repo = repo,
        _vaultId = vaultId,
        _marketData = marketData,
        _amfi = amfi;

  final DriftPortfolioRepository _repo;
  final String _vaultId;
  final MarketDataService _marketData;
  final AmfiNavProvider? _amfi;

  /// Asset types that route to AMFI. Mutual funds have no ticker, so the
  /// equity chain cannot price them at all — sending them there would burn a
  /// request to learn nothing.
  static const _fundTypes = {AssetType.equityMf, AssetType.debtMf};

  /// Asset types the equity chain can price.
  static const _tickerTypes = {AssetType.equityEtf, AssetType.goldEtf};

  Future<PriceRefreshResult> refresh({List<String>? instrumentIds}) async {
    final all = await _repo.instruments(_vaultId);
    final targets = instrumentIds == null
        ? all
        : all.where((i) => instrumentIds.contains(i.id)).toList();

    final bySource = <PriceSource, int>{};
    final failures = <String>[];
    var updated = 0;
    var skipped = 0;
    DateTime? oldest;

    Future<void> write(
      Instrument instrument,
      Decimal price,
      DateTime asOf,
      PriceSource source,
    ) async {
      await _repo.recordPrice(
        vaultId: _vaultId,
        instrumentId: instrument.id,
        price: InstrumentPrice(
          instrumentId: instrument.id,
          asOf: asOf,
          price: price,
          source: source.key,
        ),
      );
      updated++;
      bySource[source] = (bySource[source] ?? 0) + 1;
      if (oldest == null || asOf.isBefore(oldest!)) oldest = asOf;
    }

    // ---- Mutual funds: AMFI, one request for the whole portfolio ----
    final funds = targets.where((i) => _fundTypes.contains(i.kind)).toList();
    if (funds.isNotEmpty && _amfi != null) {
      try {
        // Fetched once per run, never per fund. The whole-file download is also
        // what keeps the provider from learning which schemes you hold.
        final navs = await _amfi.fetchAll();
        final byIsin = <String, AmfiNav>{
          for (final n in navs.values)
            if (n.isin != null && n.isin!.isNotEmpty) n.isin!: n,
        };
        for (final fund in funds) {
          final nav = (fund.schemeCode != null ? navs[fund.schemeCode] : null) ??
              (fund.isin != null ? byIsin[fund.isin] : null);
          if (nav == null) {
            failures.add(fund.name);
            continue;
          }
          // The NAV's own date, never `now`. Funds publish a day behind, and
          // that lag is the honest number — stamping the fetch time would claim
          // a freshness the value does not have.
          await write(fund, nav.nav, nav.date ?? DateTime.now(),
              PriceSource.amfi);
        }
      } on Object {
        failures.addAll(funds.map((f) => f.name));
      }
    } else if (funds.isNotEmpty) {
      failures.addAll(funds.map((f) => f.name));
    }

    // ---- Equities and ETFs: the ticker chain ----
    final tickered = targets
        .where((i) => _tickerTypes.contains(i.kind) && i.tickerSymbol != null)
        .toList();
    if (tickered.isNotEmpty) {
      try {
        final quotes = await _marketData
            .fetchPrices(tickered.map((i) => i.tickerSymbol!).toList());
        final providerName = await _marketData.activeProvider();
        final source = _sourceFor(providerName);
        // The chain reports no per-quote timestamp, so this is genuinely "as of
        // when we asked" — unlike the AMFI path, where a real date exists.
        final asOf = DateTime.now();
        for (final instrument in tickered) {
          final price = quotes[instrument.tickerSymbol];
          if (price == null) {
            failures.add(instrument.name);
            continue;
          }
          await write(instrument, price, asOf, source);
        }
      } on MarketDataUnavailableException {
        failures.addAll(tickered.map((i) => i.name));
      }
    }

    // ---- Everything else: no free live source exists ----
    skipped = targets
        .where((i) =>
            !_fundTypes.contains(i.kind) &&
            !(_tickerTypes.contains(i.kind) && i.tickerSymbol != null))
        .length;

    return PriceRefreshResult(
      updated: updated,
      skipped: skipped,
      bySource: bySource,
      failures: failures,
      oldestAsOf: oldest,
    );
  }

  static PriceSource _sourceFor(String? providerName) => switch (providerName) {
        'Yahoo Finance' => PriceSource.yahoo,
        'AlphaVantage' => PriceSource.alphaVantage,
        'TwelveData' => PriceSource.twelveData,
        // The in-memory last-resort provider. Recording it as `cache` rather
        // than as whichever live source it originally came from is the point:
        // a re-served value is stale, and the UI must be able to tell.
        _ => PriceSource.cache,
      };
}
