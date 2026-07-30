import 'package:decimal/decimal.dart';
import 'package:khazana/domain/entities/holding.dart';
import 'package:khazana/domain/services/portfolio_diff.dart';
import 'package:khazana/features/import/broker_parser.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const engine = PortfolioDiffEngine();

  Holding holding(String sym, String qty, String avg) => Holding(
        id: sym,
        vaultId: 'v',
        symbol: sym,
        exchange: 'NSE',
        quantity: Decimal.parse(qty),
        avgCost: Decimal.parse(avg),
        firstPurchaseDate: DateTime(2025, 1, 1),
      );

  StagedHolding staged(String sym, String qty, String avg) => StagedHolding(
        symbol: sym,
        exchange: 'NSE',
        quantity: Decimal.parse(qty),
        avgCost: Decimal.parse(avg),
      );

  group('PortfolioDiffEngine (PRD §14/§16 idempotent import)', () {
    test('new symbols are added', () {
      final d = engine.diff([], [staged('INFY', '10', '1500')]);
      expect(d.added.length, 1);
      expect(d.isNoOp, isFalse);
    });

    test('re-importing identical data is a no-op (idempotent)', () {
      final existing = [holding('INFY', '10', '1500')];
      final d = engine.diff(existing, [staged('INFY', '10', '1500')]);
      expect(d.isNoOp, isTrue);
      expect(d.unchanged.length, 1);
    });

    test('a changed quantity shows exactly one change', () {
      final existing = [
        holding('INFY', '10', '1500'),
        holding('TCS', '5', '3000'),
      ];
      final d = engine.diff(existing, [
        staged('INFY', '12', '1500'), // qty changed
        staged('TCS', '5', '3000'), // unchanged
      ]);
      expect(d.changed.length, 1);
      expect(d.changed.single.staged.symbol, 'INFY');
      expect(d.unchanged.length, 1);
    });
  });

  group('ZerodhaXlsxParser.parseRows', () {
    test('locates header and maps holdings rows', () {
      final rows = <List<String?>>[
        ['Zerodha holdings as on ...', null, null],
        ['Symbol', 'Quantity Available', 'Average Price', 'LTP'],
        ['INFY', '10', '1,500.50', '1600'],
        ['TCS', '5', '3000', '3200'],
        [null, null, null, null],
      ];
      final out = ZerodhaXlsxParser.parseRows(rows);
      expect(out.length, 2);
      expect(out.first.symbol, 'INFY');
      expect(out.first.quantity, Decimal.parse('10'));
      expect(out.first.avgCost, Decimal.parse('1500.50'));
    });

    test('throws when the format does not match', () {
      expect(
        () => ZerodhaXlsxParser.parseRows([
          ['some', 'random', 'file'],
        ]),
        throwsA(anything),
      );
    });
  });

  group('UpstoxCsvParser.parseRowsForTest', () {
    test('maps Instrument/Quantity/Average columns', () {
      final rows = <List<String?>>[
        ['Instrument', 'Quantity', 'Average Price'],
        ['RELIANCE', '3', '2,800.00'],
        ['HDFCBANK', '7', '1500'],
      ];
      final out = UpstoxCsvParser.parseRowsForTest(rows);
      expect(out.map((h) => h.symbol), ['RELIANCE', 'HDFCBANK']);
      expect(out.first.avgCost, Decimal.parse('2800.00'));
    });
  });
}
