import 'package:decimal/decimal.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/data/repositories/drift_portfolio_repository.dart';
import 'package:khazana/domain/entities/holding.dart';
import 'package:khazana/domain/entities/portfolio.dart';
import 'package:khazana/domain/services/market_data.dart';
import 'package:khazana/features/investments/data/amfi_nav_provider.dart';
import 'package:khazana/features/investments/services/price_refresh_service.dart';

/// Routing and honesty rules for the price refresh.
///
/// The behaviour this replaces wrote every price into an undated column, so a
/// quote fetched three weeks ago was indistinguishable from one fetched a
/// minute ago. These tests pin the two things that fixed: prices carry the
/// date their *source* reported, and each asset type goes to a provider that
/// can actually answer for it.
void main() {
  late AppDatabase db;
  late DriftPortfolioRepository repo;
  const vault = 'v1';

  Decimal d(String s) => Decimal.parse(s);

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    repo = DriftPortfolioRepository(db.portfolioDao);
  });
  tearDown(() => db.close());

  Future<Instrument> instrument(
    String id,
    AssetType kind, {
    String? symbol,
    String? schemeCode,
    String? isin,
  }) async {
    final i = Instrument(
      id: id,
      vaultId: vault,
      kind: kind,
      name: id,
      symbol: symbol,
      exchange: symbol == null ? null : 'NSE',
      schemeCode: schemeCode,
      isin: isin,
    );
    await repo.saveInstrument(i);
    return i;
  }

  Future<InstrumentPrice?> priceOf(String instrumentId) async =>
      (await repo.latestPrices(vault))[instrumentId];

  group('routing', () {
    test('a mutual fund never reaches the ticker chain', () async {
      await instrument('mf1', AssetType.equityMf, schemeCode: '122639');
      final equity = _RecordingMarketData();

      await PriceRefreshService(
        repo: repo,
        vaultId: vault,
        marketData: MarketDataService([equity]),
        amfi: AmfiNavProvider(
          client: _FakeAmfiClient('''
Scheme Code;ISIN Div Payout;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
122639;INF879O01019;-;Parag Parikh Flexi Cap;71.1900;05-Jun-2026
'''),
        ),
      ).refresh();

      expect(equity.requested, isEmpty,
          reason: 'funds have no ticker, so asking Yahoo burns a request to '
              'learn nothing');
    });

    test('a bond reaches no provider at all and is reported as skipped',
        () async {
      await instrument('b1', AssetType.bond);
      final equity = _RecordingMarketData();

      final result = await PriceRefreshService(
        repo: repo,
        vaultId: vault,
        marketData: MarketDataService([equity]),
      ).refresh();

      expect(equity.requested, isEmpty);
      expect(result.skipped, 1);
      expect(result.failures, isEmpty,
          reason: 'no free live source exists for G-Secs; that is not a '
              'failure and must not be reported as one');
      expect(await priceOf('b1'), isNull);
    });

    test('equities and ETFs go to the ticker chain', () async {
      await instrument('e1', AssetType.equityEtf, symbol: 'INFY');
      await instrument('e2', AssetType.goldEtf, symbol: 'GOLDBEES');
      final equity = _RecordingMarketData(prices: {
        'INFY.NS': d('1700'),
        'GOLDBEES.NS': d('62.80'),
      });

      final result = await PriceRefreshService(
        repo: repo,
        vaultId: vault,
        marketData: MarketDataService([equity]),
      ).refresh();

      expect(equity.requested, hasLength(2));
      expect(result.updated, 2);
      expect((await priceOf('e1'))!.price, d('1700'));
    });
  });

  group('AMFI', () {
    const navFile = '''
Scheme Code;ISIN Div Payout;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
122639;INF879O01019;-;Parag Parikh Flexi Cap;71.1900;05-Jun-2026
120753;INF109K01Z48;-;ICICI Corporate Bond;28.9400;05-Jun-2026
''';

    test('matches by scheme code, and dates the price from the NAV row',
        () async {
      await instrument('mf1', AssetType.equityMf, schemeCode: '122639');
      final client = _FakeAmfiClient(navFile);

      await PriceRefreshService(
        repo: repo,
        vaultId: vault,
        marketData: MarketDataService(const []),
        amfi: AmfiNavProvider(client: client),
      ).refresh();

      final price = (await priceOf('mf1'))!;
      expect(price.price, d('71.19'));
      expect(price.priceSource, PriceSource.amfi);
      // The NAV's own date, not the fetch time. Funds publish a day behind,
      // and stamping "now" would claim a freshness the value does not have.
      expect(price.asOf, DateTime(2026, 6, 5));
      expect(price.quality, PriceQuality.official);
      expect(price.isIndicative, isFalse);
    });

    test('falls back to ISIN when no scheme code is recorded', () async {
      // A holding imported from a statement may carry only an ISIN.
      await instrument('mf1', AssetType.debtMf, isin: 'INF109K01Z48');

      await PriceRefreshService(
        repo: repo,
        vaultId: vault,
        marketData: MarketDataService(const []),
        amfi: AmfiNavProvider(client: _FakeAmfiClient(navFile)),
      ).refresh();

      expect((await priceOf('mf1'))!.price, d('28.94'));
    });

    test('downloads the file once, however many funds are held', () async {
      for (var i = 0; i < 5; i++) {
        await instrument('mf$i', AssetType.equityMf, schemeCode: '122639');
      }
      final client = _FakeAmfiClient(navFile);

      await PriceRefreshService(
        repo: repo,
        vaultId: vault,
        marketData: MarketDataService(const []),
        amfi: AmfiNavProvider(client: client),
      ).refresh();

      // Both the privacy property and the scale one: a per-scheme API would
      // hand the provider the whole portfolio, one request at a time.
      expect(client.calls, 1);
    });

    test('an unknown scheme is reported, not silently priced', () async {
      await instrument('mf1', AssetType.equityMf, schemeCode: '999999');

      final result = await PriceRefreshService(
        repo: repo,
        vaultId: vault,
        marketData: MarketDataService(const []),
        amfi: AmfiNavProvider(client: _FakeAmfiClient(navFile)),
      ).refresh();

      expect(result.updated, 0);
      expect(result.failures, ['mf1']);
      expect(await priceOf('mf1'), isNull);
    });
  });

  group('reporting', () {
    test('a provider outage names the affected holdings', () async {
      await instrument('e1', AssetType.equityEtf, symbol: 'INFY');

      final result = await PriceRefreshService(
        repo: repo,
        vaultId: vault,
        // No providers at all: the chain throws.
        marketData: MarketDataService(const []),
      ).refresh();

      expect(result.updated, 0);
      expect(result.failures, ['e1'],
          reason: 'a silent partial refresh is how a stale price gets '
              'mistaken for a fresh one');
    });

    test('re-running is idempotent rather than piling up rows', () async {
      await instrument('e1', AssetType.equityEtf, symbol: 'INFY');
      final service = PriceRefreshService(
        repo: repo,
        vaultId: vault,
        marketData: MarketDataService([
          _RecordingMarketData(prices: {'INFY.NS': d('1700')}),
        ]),
      );
      await service.refresh();
      await service.refresh();
      expect((await priceOf('e1'))!.price, d('1700'));
    });

    test('oldestAsOf surfaces the laggiest price in the run', () async {
      await instrument('mf1', AssetType.equityMf, schemeCode: '122639');
      await instrument('e1', AssetType.equityEtf, symbol: 'INFY');

      final result = await PriceRefreshService(
        repo: repo,
        vaultId: vault,
        marketData: MarketDataService([
          _RecordingMarketData(prices: {'INFY.NS': d('1700')}),
        ]),
        amfi: AmfiNavProvider(client: _FakeAmfiClient('''
Scheme Code;ISIN Div Payout;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
122639;INF879O01019;-;Parag Parikh Flexi Cap;71.1900;05-Jun-2026
''')),
      ).refresh();

      expect(result.updated, 2);
      // The whole run can succeed and still leave the portfolio on yesterday's
      // fund NAV, which is what the UI needs to be able to say.
      expect(result.oldestAsOf, DateTime(2026, 6, 5));
    });
  });
}

/// A market-data provider that records what it was asked for.
class _RecordingMarketData implements MarketDataProvider {
  _RecordingMarketData({this.prices = const {}});

  final Map<String, Decimal> prices;
  final List<String> requested = [];

  @override
  String get providerName => 'Yahoo Finance';

  @override
  Future<bool> isAvailable() async => true;

  @override
  Future<Map<String, Decimal>> fetchPrices(List<String> tickers) async {
    requested.addAll(tickers);
    return {
      for (final t in tickers)
        if (prices.containsKey(t)) t: prices[t]!,
    };
  }
}

/// Serves a fixed NAV file and counts how many times it was asked.
class _FakeAmfiClient extends http.BaseClient {
  _FakeAmfiClient(this.body);

  final String body;
  int calls = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    calls++;
    return http.StreamedResponse(
      Stream.value(body.codeUnits),
      200,
      request: request,
    );
  }
}
