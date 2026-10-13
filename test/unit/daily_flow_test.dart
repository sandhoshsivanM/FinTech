import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/domain/entities/transaction.dart';
import 'package:khazana/domain/services/daily_flow.dart';

/// The twin of `webapp/src/domain/dailyFlow.test.ts`.
void main() {
  final now = DateTime(2026, 10, 13, 15);
  Txn txn(String id, DateTime at, TxnType type, String amount) => Txn(
        id: id,
        vaultId: 'v',
        amount: Decimal.parse(amount),
        type: type,
        categoryId: 'c',
        date: at,
        createdAt: at,
      );

  test('seven local days, oldest first, ending today', () {
    final days = dailyFlow(const [], now);
    expect(days, hasLength(7));
    expect(days.first.day, DateTime(2026, 10, 7));
    expect(days.last.day, DateTime(2026, 10, 13));
  });

  test('sums income and spending into the right day', () {
    final days = dailyFlow([
      txn('a', DateTime(2026, 10, 13, 9), TxnType.expense, '120'),
      txn('b', DateTime(2026, 10, 13, 20), TxnType.expense, '450.50'),
      txn('c', DateTime(2026, 10, 12, 10), TxnType.income, '90000'),
    ], now);
    expect(days.last.expense, Decimal.parse('570.5'));
    expect(days.last.income, Decimal.zero);
    expect(days[5].income, Decimal.parse('90000'));
    expect(days[5].net, Decimal.parse('90000'));
  });

  test('a midnight-adjacent transaction stays on its own local day', () {
    final days = dailyFlow([
      txn('late', DateTime(2026, 10, 12, 23, 59), TxnType.expense, '10'),
      txn('early', DateTime(2026, 10, 13, 0, 1), TxnType.expense, '20'),
    ], now);
    expect(days[5].expense, Decimal.parse('10'));
    expect(days[6].expense, Decimal.parse('20'));
  });

  test('older than the window is left out', () {
    final days =
        dailyFlow([txn('old', DateTime(2026, 10, 6), TxnType.expense, '999')], now);
    expect(days.every((d) => d.expense == Decimal.zero), isTrue);
  });

  group('describeChange', () {
    Decimal d(num n) => Decimal.parse('$n');
    test('a percentage up to double', () {
      expect(describeChange(d(118), d(100)), (up: true, text: '18%'));
      expect(describeChange(d(82), d(100)), (up: false, text: '18%'));
    });
    test('a multiple beyond double, so 5145% reads as 52×', () {
      expect(describeChange(d(187769), d(3580)), (up: true, text: '52×'));
      expect(describeChange(d(250), d(100)), (up: true, text: '2.5×'));
    });
    test('nothing to compare against', () {
      expect(describeChange(d(10), Decimal.zero), isNull);
    });
  });
}
