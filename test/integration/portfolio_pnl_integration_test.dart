import 'dart:convert';
import 'dart:io';

import 'package:decimal/decimal.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/data/repositories/drift_portfolio_repository.dart';
import 'package:khazana/domain/entities/holding.dart';
import 'package:khazana/domain/entities/portfolio.dart';
import 'package:khazana/domain/services/instrument_master.dart';
import 'package:khazana/domain/services/portfolio_analytics.dart';

/// End-to-end test of the sector-wise P&L stack on a real (in-memory) encrypted
/// schema: repository writes -> Drift rows -> repository reads -> analytics ->
/// roll-up. Everything except the widgets.
void main() {
  late AppDatabase db;
  late DriftPortfolioRepository repo;
  const pa = PortfolioAnalytics();
  const vault = 'v1';

  Decimal d(String s) => Decimal.parse(s);
  DateTime day(int y, int m, int dd) => DateTime.utc(y, m, dd);

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    repo = DriftPortfolioRepository(db.portfolioDao);
  });

  tearDown(() => db.close());

  Future<void> seedHolding({
    required String id,
    required String symbol,
    required String sector,
    required String industry,
    required String qty,
    required String buyPrice,
    required String charges,
    required String nowPrice,
    AssetType kind = AssetType.equityEtf,
    MarketCapBand cap = MarketCapBand.large,
  }) async {
    await repo.saveInstrument(Instrument(
      id: id,
      vaultId: vault,
      kind: kind,
      name: symbol,
      symbol: symbol,
      exchange: 'NSE',
      sectorCode: sector,
      industryCode: industry,
      marketCapBand: cap,
    ));
    await repo.saveTrade(Trade(
      id: 'buy-$id',
      vaultId: vault,
      instrumentId: id,
      side: TradeSide.buy,
      quantity: d(qty),
      pricePerUnit: d(buyPrice),
      otherCharges: d(charges),
      tradeDate: day(2026, 1, 15),
      isReviewed: true,
    ));
    await repo.recordPrice(
      vaultId: vault,
      instrumentId: id,
      price: InstrumentPrice(
        instrumentId: id,
        asOf: day(2026, 7, 30),
        price: d(nowPrice),
        source: 'manual',
      ),
    );
  }

  Future<PortfolioSnapshot> build() async {
    return pa.snapshot(
      instruments: await repo.instruments(vault),
      trades: await repo.trades(vault),
      latestPrices: await repo.latestPrices(vault),
      dividends: await repo.dividends(vault),
    );
  }

  test('sector-wise P&L round-trips through the database and reconciles',
      () async {
    // Hand-computed:
    //   INFY  IT         10 @ 1500 + 20 chg = 15020 cost; @1650 -> 16500 value
    //   TCS   IT          5 @ 3000 + 30 chg = 15030 cost; @2900 -> 14500 value
    //   HDFCB Financials 20 @  700 + 10 chg = 14010 cost; @ 750 -> 15000 value
    // IT:         cost 30050, value 31000, P&L +950
    // Financials: cost 14010, value 15000, P&L +990
    // Total:      cost 44060, value 46000, P&L +1940
    await seedHolding(
        id: 'INFY', symbol: 'INFY', sector: 'Information Technology',
        industry: 'IT - Software', qty: '10', buyPrice: '1500',
        charges: '20', nowPrice: '1650');
    await seedHolding(
        id: 'TCS', symbol: 'TCS', sector: 'Information Technology',
        industry: 'IT - Software', qty: '5', buyPrice: '3000',
        charges: '30', nowPrice: '2900');
    await seedHolding(
        id: 'HDFCBANK', symbol: 'HDFCBANK', sector: 'Financial Services',
        industry: 'Banks', qty: '20', buyPrice: '700',
        charges: '10', nowPrice: '750');

    final snap = await build();

    expect(snap.positions, hasLength(3));
    expect(snap.costBasis, d('44060'));
    expect(snap.marketValue, d('46000'));
    expect(snap.unrealisedPnl, d('1940'));

    final bySector = {
      for (final r in pa.rollup(snap.positions, RollupDimension.sector))
        r.key: r
    };
    expect(bySector['Information Technology']!.costBasis, d('30050'));
    expect(bySector['Information Technology']!.marketValue, d('31000'));
    expect(bySector['Information Technology']!.pnl, d('950'));
    expect(bySector['Financial Services']!.pnl, d('990'));

    // The acceptance invariant, through the real persistence layer.
    final summed = bySector.values
        .fold(Decimal.zero, (s, r) => s + r.pnl);
    expect(summed, snap.unrealisedPnl);
  });

  test('a partial sell produces realised P&L that survives a reload', () async {
    await seedHolding(
        id: 'INFY', symbol: 'INFY', sector: 'Information Technology',
        industry: 'IT - Software', qty: '10', buyPrice: '1000',
        charges: '0', nowPrice: '1200');

    // Sell 4 @ 1500 with 50 charges: proceeds 6000 - 50 = 5950.
    // FIFO cost for 4 units at 1000 = 4000. Realised = 1950.
    // Remaining 6 units cost 6000; @1200 -> 7200 value, unrealised +1200.
    await repo.saveTrade(Trade(
      id: 'sell-1',
      vaultId: vault,
      instrumentId: 'INFY',
      side: TradeSide.sell,
      quantity: d('4'),
      pricePerUnit: d('1500'),
      otherCharges: d('50'),
      tradeDate: day(2026, 6, 1),
      isReviewed: true,
    ));

    final snap = await build();
    expect(snap.realisedPnl, d('1950'));
    expect(snap.positions.single.quantity, d('6'));
    expect(snap.positions.single.costBasis, d('6000'));
    expect(snap.unrealisedPnl, d('1200'));
    expect(snap.totalPnl, d('3150'));
  });

  test('an unclassified holding still reconciles into the sector roll-up',
      () async {
    await repo.saveInstrument(Instrument(
      id: 'UNKNOWN',
      vaultId: vault,
      kind: AssetType.equityEtf,
      name: 'SOMETHING',
      symbol: 'SOMETHING',
      exchange: 'NSE',
      // No sector: not in the bundled master.
    ));
    await repo.saveTrade(Trade(
      id: 'b1',
      vaultId: vault,
      instrumentId: 'UNKNOWN',
      side: TradeSide.buy,
      quantity: d('1'),
      pricePerUnit: d('100'),
      tradeDate: day(2026, 1, 1),
      isReviewed: true,
    ));

    final snap = await build();
    final rows = pa.rollup(snap.positions, RollupDimension.sector);
    expect(rows.single.key, unclassifiedKey);
    expect(rows.single.costBasis, snap.costBasis);
  });

  test('a user sector override persists and drives the roll-up', () async {
    await seedHolding(
        id: 'RELIANCE', symbol: 'RELIANCE',
        sector: 'Oil Gas & Consumable Fuels', industry: 'Refineries & Marketing',
        qty: '1', buyPrice: '100', charges: '0', nowPrice: '110');

    await repo.setSectorOverride('RELIANCE', 'Conglomerate');

    final snap = await build();
    final rows = pa.rollup(snap.positions, RollupDimension.sector);
    expect(rows.single.key, 'Conglomerate');
  });

  test('re-classification never clobbers a user override', () async {
    await seedHolding(
        id: 'INFY', symbol: 'INFY', sector: 'Information Technology',
        industry: 'IT - Software', qty: '1', buyPrice: '100',
        charges: '0', nowPrice: '110');
    await repo.setSectorOverride('INFY', 'My Own Bucket');

    // Simulate a bundled-master upgrade re-applying classification.
    await repo.applyClassification('INFY',
        sectorCode: 'Information Technology',
        industryCode: 'IT - Software',
        marketCapBand: 'large');

    final instruments = await repo.instruments(vault);
    expect(instruments.single.sectorCode, 'Information Technology');
    expect(instruments.single.sectorOverride, 'My Own Bucket');
    // The override still wins.
    expect(instruments.single.sector, 'My Own Bucket');
  });

  test('the bundled instrument master classifies a known symbol', () async {
    // Uses the real shipped asset rather than a fixture.
    final master = InstrumentMaster.fromJson(_realMaster());
    final hit = master.lookup(symbol: 'INFY');
    expect(hit, isNotNull);
    expect(hit!.sector, 'Information Technology');
    expect(hit.cap, MarketCapBand.large);

    // And an unknown symbol yields nothing rather than a guess.
    expect(master.lookup(symbol: 'NOTAREALSYMBOL'), isNull);
  });

  test('latest price wins when several are recorded', () async {
    await seedHolding(
        id: 'INFY', symbol: 'INFY', sector: 'Information Technology',
        industry: 'IT - Software', qty: '1', buyPrice: '100',
        charges: '0', nowPrice: '110');

    // An older observation must not override the newer one.
    await repo.recordPrice(
      vaultId: vault,
      instrumentId: 'INFY',
      price: InstrumentPrice(
        instrumentId: 'INFY',
        asOf: day(2026, 1, 1),
        price: d('90'),
        source: 'manual',
      ),
    );

    final snap = await build();
    expect(snap.positions.single.price, d('110'));
    // Compare the instant, not the object: timestamps persist as epoch
    // milliseconds and read back in the local zone, so a DateTime written as
    // UTC is not `==` to the value returned even though it is the same moment.
    expect(
      snap.positions.single.pricedAt!.isAtSameMomentAs(day(2026, 7, 30)),
      isTrue,
    );
  });

  test('unreviewed lots are counted so the UI can disclose them', () async {
    await repo.saveInstrument(Instrument(
      id: 'i1', vaultId: vault, kind: AssetType.equityEtf,
      name: 'X', symbol: 'X', exchange: 'NSE',
    ));
    await repo.saveTrade(Trade(
      id: 't1', vaultId: vault, instrumentId: 'i1', side: TradeSide.buy,
      quantity: d('1'), pricePerUnit: d('100'),
      tradeDate: day(2026, 1, 1),
      source: TradeSource.legacy,
      isReviewed: false,
    ));

    expect(await repo.unreviewedCount(vault), 1);
    await repo.markReviewed('t1');
    expect(await repo.unreviewedCount(vault), 0);
  });
}

/// Reads the shipped instrument master from disk.
Map<String, dynamic> _realMaster() {
  final file = File('assets/instrument_master.json');
  return jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
}
