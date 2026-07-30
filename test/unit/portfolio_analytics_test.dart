import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/domain/entities/asset_group.dart';
import 'package:khazana/domain/entities/holding.dart';
import 'package:khazana/domain/entities/portfolio.dart';
import 'package:khazana/domain/services/portfolio_analytics.dart';

/// Tests for lot-level P&L.
///
/// Every expected figure below is hand-computed in the comments, so the tests
/// check the maths against arithmetic rather than against the implementation.
void main() {
  const pa = PortfolioAnalytics();
  Decimal d(String s) => Decimal.parse(s);
  DateTime day(int y, int m, int dd) => DateTime.utc(y, m, dd);

  Instrument inst(
    String id, {
    AssetType kind = AssetType.equityEtf,
    String? sector,
    String? industry,
    MarketCapBand? cap,
    String? sectorOverride,
    String currency = 'INR',
  }) =>
      Instrument(
        id: id,
        vaultId: 'v1',
        kind: kind,
        name: id,
        symbol: id,
        exchange: 'NSE',
        sectorCode: sector,
        industryCode: industry,
        marketCapBand: cap,
        sectorOverride: sectorOverride,
        currency: currency,
      );

  Trade buy(
    String id,
    String instrumentId, {
    required String qty,
    required String price,
    required DateTime on,
    String charges = '0',
    bool reviewed = true,
  }) =>
      Trade(
        id: id,
        vaultId: 'v1',
        instrumentId: instrumentId,
        side: TradeSide.buy,
        quantity: d(qty),
        pricePerUnit: d(price),
        tradeDate: on,
        brokerage: d(charges),
        isReviewed: reviewed,
      );

  Trade sell(
    String id,
    String instrumentId, {
    required String qty,
    required String price,
    required DateTime on,
    String charges = '0',
  }) =>
      Trade(
        id: id,
        vaultId: 'v1',
        instrumentId: instrumentId,
        side: TradeSide.sell,
        quantity: d(qty),
        pricePerUnit: d(price),
        tradeDate: on,
        brokerage: d(charges),
        isReviewed: true,
      );

  InstrumentPrice price(String instrumentId, String p, {DateTime? at}) =>
      InstrumentPrice(
        instrumentId: instrumentId,
        asOf: at ?? day(2026, 7, 30),
        price: d(p),
        source: 'manual',
      );

  group('cost basis includes charges', () {
    test('a buy costs gross plus charges', () {
      // 10 x 100 = 1000, + 25 charges = 1025
      final t = buy('t1', 'i1', qty: '10', price: '100', on: day(2026, 1, 1), charges: '25');
      expect(t.gross, d('1000'));
      expect(t.charges, d('25'));
      expect(t.netAmount, d('1025'));
    });

    test('a sell nets gross minus charges', () {
      // 10 x 120 = 1200, - 30 charges = 1170
      final t = sell('t2', 'i1', qty: '10', price: '120', on: day(2026, 6, 1), charges: '30');
      expect(t.gross, d('1200'));
      expect(t.netAmount, d('1170'));
    });

    test('charges reduce P&L rather than flattering it', () {
      // Buy 10 @ 100 + 25 = 1025 cost. Price now 105 -> value 1050.
      // Unrealised = 1050 - 1025 = 25, NOT the 50 you would get ignoring charges.
      final snap = pa.snapshot(
        instruments: [inst('i1')],
        trades: [buy('t1', 'i1', qty: '10', price: '100', on: day(2026, 1, 1), charges: '25')],
        latestPrices: {'i1': price('i1', '105')},
      );
      expect(snap.costBasis, d('1025'));
      expect(snap.marketValue, d('1050'));
      expect(snap.unrealisedPnl, d('25'));
    });
  });

  group('FIFO matching', () {
    test('a partial sell consumes the oldest lot first', () {
      // Buy 10 @ 100 (Jan), buy 10 @ 200 (Feb), sell 5 @ 300 (Mar).
      // FIFO: the 5 sold come from the Jan lot at cost 100 -> cost basis 500,
      // proceeds 1500, realised = 1000.
      // Remaining: 5 @ 100 (500) + 10 @ 200 (2000) = 15 units, cost 2500.
      final trades = [
        buy('b1', 'i1', qty: '10', price: '100', on: day(2026, 1, 1)),
        buy('b2', 'i1', qty: '10', price: '200', on: day(2026, 2, 1)),
        sell('s1', 'i1', qty: '5', price: '300', on: day(2026, 3, 1)),
      ];
      final r = pa.matchFifo(trades);

      expect(r.closed, hasLength(1));
      expect(r.closed.single.quantity, d('5'));
      expect(r.closed.single.costBasis, d('500'));
      expect(r.closed.single.proceeds, d('1500'));
      expect(r.closed.single.realisedPnl, d('1000'));
      expect(r.closed.single.buyDate, day(2026, 1, 1));

      final openQty = r.open.fold(Decimal.zero, (s, l) => s + l.quantity);
      final openCost = r.open.fold(Decimal.zero, (s, l) => s + l.costBasis);
      expect(openQty, d('15'));
      expect(openCost, d('2500'));
    });

    test('a sell spanning two lots splits across both', () {
      // Buy 10 @ 100, buy 10 @ 200, sell 15 @ 300.
      // 10 from lot 1 (cost 1000) + 5 from lot 2 (cost 1000) = 2000 cost basis.
      // Proceeds 15 x 300 = 4500. Realised = 2500. Remaining 5 @ 200 = 1000.
      final r = pa.matchFifo([
        buy('b1', 'i1', qty: '10', price: '100', on: day(2026, 1, 1)),
        buy('b2', 'i1', qty: '10', price: '200', on: day(2026, 2, 1)),
        sell('s1', 'i1', qty: '15', price: '300', on: day(2026, 3, 1)),
      ]);

      expect(r.closed, hasLength(2));
      final realised =
          r.closed.fold(Decimal.zero, (s, x) => s + x.realisedPnl);
      expect(realised, d('2500'));
      expect(r.open, hasLength(1));
      expect(r.open.single.quantity, d('5'));
      expect(r.open.single.costBasis, d('1000'));
    });

    test('a fully exited position leaves no open lot but keeps realised P&L', () {
      // Buy 10 @ 100 = 1000, sell all 10 @ 150 = 1500. Realised 500.
      final snap = pa.snapshot(
        instruments: [inst('i1')],
        trades: [
          buy('b1', 'i1', qty: '10', price: '100', on: day(2026, 1, 1)),
          sell('s1', 'i1', qty: '10', price: '150', on: day(2026, 5, 1)),
        ],
        latestPrices: const {},
      );
      expect(snap.positions, isEmpty);
      expect(snap.realisedPnl, d('500'));
      expect(snap.unrealisedPnl, Decimal.zero);
      expect(snap.totalPnl, d('500'));
    });

    test('selling more than was ever bought does not invent a short position', () {
      // Buy 5, sell 10. Only 5 can be matched; the excess is ignored rather
      // than producing a negative lot that would corrupt every total.
      final r = pa.matchFifo([
        buy('b1', 'i1', qty: '5', price: '100', on: day(2026, 1, 1)),
        sell('s1', 'i1', qty: '10', price: '150', on: day(2026, 2, 1)),
      ]);
      expect(r.open, isEmpty);
      expect(r.closed, hasLength(1));
      expect(r.closed.single.quantity, d('5'));
    });

    test('matching is deterministic when two trades share a date', () {
      final trades = [
        buy('b2', 'i1', qty: '10', price: '200', on: day(2026, 1, 1)),
        buy('b1', 'i1', qty: '10', price: '100', on: day(2026, 1, 1)),
        sell('s1', 'i1', qty: '10', price: '300', on: day(2026, 2, 1)),
      ];
      // Same-date ties break on id, so 'b1' (cost 100) is consumed first.
      final a = pa.matchFifo(trades);
      final b = pa.matchFifo(trades.reversed.toList());
      expect(a.closed.single.costBasis, d('1000'));
      expect(b.closed.single.costBasis, a.closed.single.costBasis);
    });
  });

  group('unpriced positions', () {
    test('fall back to cost so nothing silently vanishes from the total', () {
      final snap = pa.snapshot(
        instruments: [inst('i1'), inst('i2')],
        trades: [
          buy('b1', 'i1', qty: '10', price: '100', on: day(2026, 1, 1)),
          buy('b2', 'i2', qty: '10', price: '50', on: day(2026, 1, 1)),
        ],
        latestPrices: {'i1': price('i1', '120')},
      );
      // i1: value 1200, cost 1000. i2 unpriced: value == cost == 500.
      expect(snap.marketValue, d('1700'));
      expect(snap.costBasis, d('1500'));
      expect(snap.unrealisedPnl, d('200'));
      expect(snap.unpriced, hasLength(1));
      expect(snap.unpriced.single.instrument.id, 'i2');
    });

    test('expose the price timestamp so staleness is showable', () {
      final snap = pa.snapshot(
        instruments: [inst('i1')],
        trades: [buy('b1', 'i1', qty: '1', price: '100', on: day(2026, 1, 1))],
        latestPrices: {'i1': price('i1', '120', at: day(2026, 7, 1))},
      );
      expect(snap.positions.single.pricedAt, day(2026, 7, 1));
      expect(snap.lastPricedAt, day(2026, 7, 1));
    });
  });

  group('rollup', () {
    // Three instruments across two sectors, hand-computed:
    //   IT / Infosys      buy 10 @ 100 = 1000 cost, price 150 -> 1500 value
    //   IT / TCS          buy  5 @ 200 = 1000 cost, price 180 ->  900 value
    //   Financials / HDFC buy 20 @  50 = 1000 cost, price  60 -> 1200 value
    // Totals: cost 3000, value 3600, P&L +600.
    // IT: cost 2000, value 2400, P&L +400 (+20%).
    // Financials: cost 1000, value 1200, P&L +200 (+20%).
    late PortfolioSnapshot snap;

    setUp(() {
      snap = pa.snapshot(
        instruments: [
          inst('INFY', sector: 'Information Technology', industry: 'IT Services', cap: MarketCapBand.large),
          inst('TCS', sector: 'Information Technology', industry: 'IT Services', cap: MarketCapBand.large),
          inst('HDFCBANK', sector: 'Financials', industry: 'Banks', cap: MarketCapBand.large),
        ],
        trades: [
          buy('b1', 'INFY', qty: '10', price: '100', on: day(2026, 1, 1)),
          buy('b2', 'TCS', qty: '5', price: '200', on: day(2026, 1, 1)),
          buy('b3', 'HDFCBANK', qty: '20', price: '50', on: day(2026, 1, 1)),
        ],
        latestPrices: {
          'INFY': price('INFY', '150'),
          'TCS': price('TCS', '180'),
          'HDFCBANK': price('HDFCBANK', '60'),
        },
      );
    });

    test('sector-wise P&L matches hand-computed arithmetic', () {
      final rows = pa.rollup(snap.positions, RollupDimension.sector);
      final bySector = {for (final r in rows) r.key: r};

      expect(bySector['Information Technology']!.costBasis, d('2000'));
      expect(bySector['Information Technology']!.marketValue, d('2400'));
      expect(bySector['Information Technology']!.pnl, d('400'));
      expect(bySector['Information Technology']!.pnlPct, d('20'));
      expect(bySector['Information Technology']!.instrumentCount, 2);

      expect(bySector['Financials']!.costBasis, d('1000'));
      expect(bySector['Financials']!.pnl, d('200'));
      expect(bySector['Financials']!.pnlPct, d('20'));
    });

    test('ACCEPTANCE: sector-wise P&L sums exactly to total P&L', () {
      // This is the test the whole feature exists to satisfy. If a roll-up does
      // not reconcile to the portfolio total, the roll-up is wrong.
      for (final dim in RollupDimension.values) {
        final rows = pa.rollup(snap.positions, dim);
        final value = rows.fold(Decimal.zero, (s, r) => s + r.marketValue);
        final cost = rows.fold(Decimal.zero, (s, r) => s + r.costBasis);
        final pnl = rows.fold(Decimal.zero, (s, r) => s + r.pnl);

        expect(value, snap.marketValue, reason: 'value mismatch for $dim');
        expect(cost, snap.costBasis, reason: 'cost mismatch for $dim');
        expect(pnl, snap.unrealisedPnl, reason: 'P&L mismatch for $dim');
      }
    });

    test('rows are sorted by market value descending', () {
      final rows = pa.rollup(snap.positions, RollupDimension.instrument);
      expect(rows.first.key, 'INFY'); // 1500
      expect(rows.last.key, 'TCS'); // 900
    });

    test('a missing sector becomes an explicit Unclassified row, never dropped', () {
      final s = pa.snapshot(
        instruments: [inst('A', sector: 'Financials'), inst('B')],
        trades: [
          buy('b1', 'A', qty: '1', price: '100', on: day(2026, 1, 1)),
          buy('b2', 'B', qty: '1', price: '100', on: day(2026, 1, 1)),
        ],
        latestPrices: const {},
      );
      final rows = pa.rollup(s.positions, RollupDimension.sector);
      expect(rows.map((r) => r.key), containsAll([unclassifiedKey, 'Financials']));
      // Dropping it would make the roll-up stop reconciling.
      expect(rows.fold(Decimal.zero, (t, r) => t + r.costBasis), s.costBasis);
    });

    test('a user sector override wins over the bundled classification', () {
      final s = pa.snapshot(
        instruments: [inst('A', sector: 'Financials', sectorOverride: 'Insurance')],
        trades: [buy('b1', 'A', qty: '1', price: '100', on: day(2026, 1, 1))],
        latestPrices: const {},
      );
      final rows = pa.rollup(s.positions, RollupDimension.sector);
      expect(rows.single.key, 'Insurance');
    });

    test('a row carries how many of its instruments are unpriced', () {
      final s = pa.snapshot(
        instruments: [
          inst('A', sector: 'Financials'),
          inst('B', sector: 'Financials'),
        ],
        trades: [
          buy('b1', 'A', qty: '1', price: '100', on: day(2026, 1, 1)),
          buy('b2', 'B', qty: '1', price: '100', on: day(2026, 1, 1)),
        ],
        latestPrices: {'A': price('A', '150')},
      );
      final rows = pa.rollup(s.positions, RollupDimension.sector);
      expect(rows.single.unpricedCount, 1);
      expect(rows.single.instrumentCount, 2);
    });

    test('pnlPct is null rather than 0 when cost is zero', () {
      final row = RollupRow(
        key: 'k',
        label: 'k',
        marketValue: Decimal.zero,
        costBasis: Decimal.zero,
        instrumentCount: 0,
        unpricedCount: 0,
      );
      expect(row.pnlPct, isNull);
    });
  });

  group('allocationByGroup', () {
    test('emits the fixed chart order, not value order', () {
      // Cash is a later slot than equity but has the larger value here; the
      // chart order must still put equity first or the validated palette's
      // colourblind guarantees no longer hold.
      final s = pa.snapshot(
        instruments: [
          inst('EQ', kind: AssetType.equityEtf),
          inst('CASH', kind: AssetType.cash),
        ],
        trades: [
          buy('b1', 'EQ', qty: '1', price: '100', on: day(2026, 1, 1)),
          buy('b2', 'CASH', qty: '1', price: '9999', on: day(2026, 1, 1)),
        ],
        latestPrices: const {},
      );
      final rows = pa.allocationByGroup(s.positions);
      expect(rows.map((r) => r.key).toList(),
          [AssetGroup.equity.name, AssetGroup.cash.name]);

      // And the value-sorted roll-up would indeed have reversed them.
      final sorted = pa.rollup(s.positions, RollupDimension.assetGroup);
      expect(sorted.first.key, AssetGroup.cash.name);
    });

    test('omits groups with no holdings', () {
      final s = pa.snapshot(
        instruments: [inst('EQ', kind: AssetType.equityEtf)],
        trades: [buy('b1', 'EQ', qty: '1', price: '100', on: day(2026, 1, 1))],
        latestPrices: const {},
      );
      expect(pa.allocationByGroup(s.positions), hasLength(1));
    });
  });

  group('dividends', () {
    test('are reported separately from capital P&L', () {
      final snap = pa.snapshot(
        instruments: [inst('i1')],
        trades: [buy('b1', 'i1', qty: '10', price: '100', on: day(2026, 1, 1))],
        latestPrices: {'i1': price('i1', '110')},
        dividends: [
          Dividend(
            id: 'd1',
            vaultId: 'v1',
            instrumentId: 'i1',
            paidOn: day(2026, 3, 1),
            amount: d('100'),
            taxDeducted: d('10'),
          ),
        ],
      );
      expect(snap.dividendIncome, d('90')); // net of TDS
      expect(snap.unrealisedPnl, d('100')); // 1100 - 1000
      // Capital P&L must not absorb dividend income.
      expect(snap.totalPnl, d('100'));
    });
  });

  group('xirr', () {
    test('a doubling over one year is about 100%', () {
      final r = pa.xirr(
        trades: [buy('b1', 'i1', qty: '1', price: '1000', on: day(2025, 1, 1))],
        dividends: const [],
        currentValue: d('2000'),
        asOf: day(2026, 1, 1),
      );
      expect(r, isNotNull);
      expect(r!, closeTo(1.0, 0.02));
    });

    test('a flat value over one year is about 0%', () {
      final r = pa.xirr(
        trades: [buy('b1', 'i1', qty: '1', price: '1000', on: day(2025, 1, 1))],
        dividends: const [],
        currentValue: d('1000'),
        asOf: day(2026, 1, 1),
      );
      expect(r!, closeTo(0.0, 0.01));
    });

    test('a loss produces a negative return', () {
      final r = pa.xirr(
        trades: [buy('b1', 'i1', qty: '1', price: '1000', on: day(2025, 1, 1))],
        dividends: const [],
        currentValue: d('800'),
        asOf: day(2026, 1, 1),
      );
      expect(r, isNotNull);
      expect(r!, lessThan(0));
      expect(r, closeTo(-0.2, 0.02));
    });

    test('dividends raise the return', () {
      final without = pa.xirr(
        trades: [buy('b1', 'i1', qty: '1', price: '1000', on: day(2025, 1, 1))],
        dividends: const [],
        currentValue: d('1000'),
        asOf: day(2026, 1, 1),
      )!;
      final with_ = pa.xirr(
        trades: [buy('b1', 'i1', qty: '1', price: '1000', on: day(2025, 1, 1))],
        dividends: [
          Dividend(
            id: 'd1',
            vaultId: 'v1',
            instrumentId: 'i1',
            paidOn: day(2025, 7, 1),
            amount: d('50'),
          ),
        ],
        currentValue: d('1000'),
        asOf: day(2026, 1, 1),
      )!;
      expect(with_, greaterThan(without));
    });

    test('returns null rather than a fabricated number when unsolvable', () {
      // No cash flows at all.
      expect(
        pa.xirr(
            trades: const [],
            dividends: const [],
            currentValue: Decimal.zero,
            asOf: day(2026, 1, 1)),
        isNull,
      );
      // Only an outflow, never any inflow.
      expect(
        pa.xirr(
          trades: [buy('b1', 'i1', qty: '1', price: '1000', on: day(2025, 1, 1))],
          dividends: const [],
          currentValue: Decimal.zero,
          asOf: day(2026, 1, 1),
        ),
        isNull,
      );
    });

    test('is unaffected by the order trades are supplied in', () {
      final trades = [
        buy('b1', 'i1', qty: '1', price: '500', on: day(2025, 1, 1)),
        buy('b2', 'i1', qty: '1', price: '500', on: day(2025, 6, 1)),
      ];
      final a = pa.xirr(
          trades: trades,
          dividends: const [],
          currentValue: d('1200'),
          asOf: day(2026, 1, 1));
      final b = pa.xirr(
          trades: trades.reversed.toList(),
          dividends: const [],
          currentValue: d('1200'),
          asOf: day(2026, 1, 1));
      expect(a, isNotNull);
      expect(b, closeTo(a!, 1e-9));
    });
  });

  group('review state', () {
    test('a position reports when any of its lots is unreviewed', () {
      final snap = pa.snapshot(
        instruments: [inst('i1')],
        trades: [
          buy('b1', 'i1', qty: '1', price: '100', on: day(2026, 1, 1), reviewed: true),
          buy('b2', 'i1', qty: '1', price: '100', on: day(2026, 2, 1), reviewed: false),
        ],
        latestPrices: const {},
      );
      expect(snap.positions.single.hasUnreviewedLots, isTrue);
    });
  });
}
