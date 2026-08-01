import 'package:decimal/decimal.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/data/repositories/drift_portfolio_repository.dart';
import 'package:khazana/domain/entities/asset_group.dart';
import 'package:khazana/domain/entities/holding.dart';
import 'package:khazana/domain/entities/investment_totals.dart';
import 'package:khazana/domain/entities/portfolio.dart';
import 'package:khazana/domain/services/portfolio_analytics.dart';

/// The regression test for APP-INVENTORY defect 7.1.
///
/// The app used to value the portfolio in two places. The Investments screen
/// read the lot model (`Instruments`/`Trades`); the Dashboard tile, the health
/// score, the safety net, account net worth and the daily snapshot each summed
/// the legacy `Holdings` table themselves. Those two answers were free to
/// disagree, and did — most visibly with sample data, which wrote only the
/// legacy table and so produced a healthy net worth beside an empty Investments
/// screen.
///
/// [InvestmentTotals] is the single derivation they now share. This test pins
/// that: whatever the Investments screen shows, every other consumer shows the
/// same number, because they are computed from the same object.
void main() {
  late AppDatabase db;
  late DriftPortfolioRepository repo;
  const analytics = PortfolioAnalytics();
  const vault = 'v1';

  Decimal d(String s) => Decimal.parse(s);
  final now = DateTime(2026, 6, 1);

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    repo = DriftPortfolioRepository(db.portfolioDao);
  });
  tearDown(() => db.close());

  Future<Instrument> instrument(String id, String name, AssetType kind) async {
    final i = Instrument(
      id: id,
      vaultId: vault,
      kind: kind,
      name: name,
      symbol: name,
      exchange: 'NSE',
    );
    await repo.saveInstrument(i);
    return i;
  }

  Future<void> buy(String id, Instrument i, String qty, String price,
      DateTime on) async {
    await repo.saveTrade(Trade(
      id: id,
      vaultId: vault,
      instrumentId: i.id,
      side: TradeSide.buy,
      quantity: d(qty),
      pricePerUnit: d(price),
      tradeDate: on,
      isReviewed: true,
    ));
  }

  Future<void> priceAt(Instrument i, String p, DateTime asOf) =>
      repo.recordPrice(
        vaultId: vault,
        instrumentId: i.id,
        price: InstrumentPrice(
          instrumentId: i.id,
          asOf: asOf,
          price: d(p),
          source: 'manual',
        ),
      );

  Future<PortfolioSnapshot> snapshot() async => analytics.snapshot(
        instruments: await repo.instruments(vault),
        trades: await repo.trades(vault),
        latestPrices: await repo.latestPrices(vault),
        dividends: await repo.dividends(vault),
      );

  test('every consumer sees the same portfolio value', () async {
    final infy = await instrument('i1', 'INFY', AssetType.equityEtf);
    final fd = await instrument('i2', 'SBIFD', AssetType.fd);
    await buy('t1', infy, '100', '1500', now.subtract(const Duration(days: 90)));
    await buy('t2', fd, '1', '500000', now.subtract(const Duration(days: 30)));
    await priceAt(infy, '1700', now);
    await priceAt(fd, '500000', now);

    final snap = await snapshot();
    final totals = InvestmentTotals.fromSnapshot(snap);

    // 100 × 1700 + 500000
    expect(snap.marketValue, d('670000'));

    // The Investments screen renders snap.marketValue; every other consumer
    // renders totals.marketValue. If these ever diverge, the app is showing two
    // numbers for one portfolio again.
    expect(totals.marketValue, snap.marketValue);
    expect(totals.costBasis, snap.costBasis);
    expect(totals.lastPricedAt, snap.lastPricedAt);
    expect(totals.positionCount, snap.positions.length);
  });

  test('group totals reconcile to the portfolio total', () async {
    final infy = await instrument('i1', 'INFY', AssetType.equityEtf);
    final gold = await instrument('i2', 'GOLDBEES', AssetType.goldEtf);
    final fd = await instrument('i3', 'SBIFD', AssetType.fd);
    await buy('t1', infy, '100', '1500', now);
    await buy('t2', gold, '500', '50', now);
    await buy('t3', fd, '1', '200000', now);
    await priceAt(infy, '1700', now);
    await priceAt(gold, '60', now);
    await priceAt(fd, '200000', now);

    final totals = InvestmentTotals.fromSnapshot(await snapshot());

    final summed = totals.valueByGroup.values
        .fold(Decimal.zero, (a, b) => a + b);
    expect(summed, totals.marketValue,
        reason: 'a group roll-up that does not reconcile means some holding '
            'is being counted twice or not at all');

    expect(totals.valueByGroup[AssetGroup.equity], d('170000'));
    expect(totals.valueByGroup[AssetGroup.gold], d('30000'));
    expect(totals.retirementValue, d('200000'));
  });

  test('an unpriced holding is carried at cost and disclosed, not dropped',
      () async {
    final infy = await instrument('i1', 'INFY', AssetType.equityEtf);
    final bond = await instrument('i2', 'GSEC2030', AssetType.bond);
    await buy('t1', infy, '100', '1500', now);
    await buy('t2', bond, '10', '1000', now);
    await priceAt(infy, '1700', now);
    // The bond is never priced — no free live source exists for G-Secs.

    final totals = InvestmentTotals.fromSnapshot(await snapshot());

    expect(totals.marketValue, d('180000'),
        reason: 'the bond must count at cost, not vanish from the total');
    expect(totals.unpricedCount, 1);
  });

  test('indicative value covers hand-entered prices, not just unpriced ones',
      () async {
    // A price you typed last month is no more a market quote than a position
    // you never priced. Both belong in the figure the UI discloses.
    final infy = await instrument('i1', 'INFY', AssetType.equityEtf);
    final bond = await instrument('i2', 'GSEC2030', AssetType.bond);
    await buy('t1', infy, '100', '1500', now);
    await buy('t2', bond, '10', '1000', now);
    await priceAt(infy, '1700', now); // recorded with source 'manual'

    final totals = InvestmentTotals.fromSnapshot(await snapshot());
    expect(totals.indicativeValue, d('180000'),
        reason: 'a manual price and an absent price are both indicative');
  });

  test('a live-sourced price is not counted as indicative', () async {
    final infy = await instrument('i1', 'INFY', AssetType.equityEtf);
    await buy('t1', infy, '100', '1500', now);
    await repo.recordPrice(
      vaultId: vault,
      instrumentId: infy.id,
      price: InstrumentPrice(
        instrumentId: infy.id,
        asOf: now,
        price: d('1700'),
        source: PriceSource.yahoo.key,
      ),
    );

    final totals = InvestmentTotals.fromSnapshot(await snapshot());
    expect(totals.marketValue, d('170000'));
    expect(totals.indicativeValue, Decimal.zero);
  });

  group('currency', () {
    Future<Instrument> foreign(String id, String currency) async {
      final i = Instrument(
        id: id,
        vaultId: vault,
        kind: AssetType.equityEtf,
        name: id,
        symbol: id,
        exchange: 'NASDAQ',
        currency: currency,
      );
      await repo.saveInstrument(i);
      return i;
    }

    test('a foreign holding is converted at the supplied rate', () async {
      final aapl = await foreign('AAPL', 'USD');
      await buy('t1', aapl, '10', '150', now);
      await priceAt(aapl, '200', now); // 2,000 USD

      final totals = InvestmentTotals.fromSnapshot(
        await snapshot(),
        baseCurrency: 'INR',
        rateFor: (c) => c == 'USD' ? d('83') : null,
      );
      expect(totals.marketValue, d('166000')); // 2000 x 83
      expect(totals.unconvertedCurrencies, isEmpty);
    });

    test('a holding with no rate is excluded and named, not counted at parity',
        () async {
      // The dangerous alternative: 2,000 USD counted as 2,000 INR understates
      // net worth by 99% and looks entirely plausible on screen.
      final aapl = await foreign('AAPL', 'USD');
      final infy = await instrument('i1', 'INFY', AssetType.equityEtf);
      await buy('t1', aapl, '10', '150', now);
      await buy('t2', infy, '100', '1500', now);
      await priceAt(aapl, '200', now);
      await priceAt(infy, '1700', now);

      final totals = InvestmentTotals.fromSnapshot(
        await snapshot(),
        baseCurrency: 'INR',
        rateFor: (_) => null,
      );
      expect(totals.marketValue, d('170000'), reason: 'INR holding only');
      expect(totals.unconvertedCurrencies, {'USD'});
      expect(totals.hasUnconverted, isTrue);
      expect(totals.positionCount, 1, reason: 'the excluded one is not counted');
    });

    test('cost basis is converted too, so P&L stays in one currency', () async {
      final aapl = await foreign('AAPL', 'USD');
      await buy('t1', aapl, '10', '150', now); // 1,500 USD cost
      await priceAt(aapl, '200', now);

      final totals = InvestmentTotals.fromSnapshot(
        await snapshot(),
        baseCurrency: 'INR',
        rateFor: (c) => c == 'USD' ? d('83') : null,
      );
      // Charges are added to cost basis, so assert the conversion held rather
      // than a bare product.
      expect(totals.costBasis > d('124000'), isTrue);
      expect(totals.unrealisedPnl, totals.marketValue - totals.costBasis);
    });
  });

  test('an empty vault is empty, and says so distinctly', () async {
    final totals = InvestmentTotals.fromSnapshot(await snapshot());
    expect(totals.isEmpty, isTrue);
    expect(totals.marketValue, Decimal.zero);
    // Undefined, not zero — a vault with nothing in it has no concentration.
    expect(totals.concentration, isNull);
  });

  test('concentration reports the largest group share', () async {
    final infy = await instrument('i1', 'INFY', AssetType.equityEtf);
    final gold = await instrument('i2', 'GOLDBEES', AssetType.goldEtf);
    await buy('t1', infy, '100', '750', now); // 75,000
    await buy('t2', gold, '500', '50', now); // 25,000
    await priceAt(infy, '750', now);
    await priceAt(gold, '50', now);

    final totals = InvestmentTotals.fromSnapshot(await snapshot());
    expect(totals.concentration, closeTo(0.75, 1e-9));
  });

  test('a partial sell leaves the remaining lots valued correctly', () async {
    final infy = await instrument('i1', 'INFY', AssetType.equityEtf);
    await buy('t1', infy, '100', '1000', now.subtract(const Duration(days: 60)));
    await buy('t2', infy, '100', '1500', now.subtract(const Duration(days: 30)));
    await repo.saveTrade(Trade(
      id: 't3',
      vaultId: vault,
      instrumentId: infy.id,
      side: TradeSide.sell,
      quantity: d('50'),
      pricePerUnit: d('1800'),
      tradeDate: now,
      isReviewed: true,
    ));
    await priceAt(infy, '1800', now);

    final snap = await snapshot();
    final totals = InvestmentTotals.fromSnapshot(snap);

    // 150 units left × 1800.
    expect(totals.marketValue, d('270000'));
    expect(snap.disposals, hasLength(1));
    // FIFO: the 50 sold came from the ₹1000 lot.
    expect(snap.disposals.single.realisedPnl, d('40000'));
  });
}
