import 'package:decimal/decimal.dart';
import 'package:khazana/domain/entities/transaction.dart';
import 'package:khazana/domain/services/net_worth_calculator.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const calc = NetWorthCalculator();
  final now = DateTime(2026, 6, 22, 12);

  Txn txn(String amount, TxnType type, DateTime date) => Txn(
        id: date.toIso8601String() + amount,
        vaultId: 'v',
        amount: Decimal.parse(amount),
        type: type,
        categoryId: 'c',
        date: date,
        createdAt: date,
      );

  test('empty → zero net worth', () {
    expect(calc.total([]), Decimal.zero);
  });

  test('expense X reduces net worth by exactly X (PRD §16, no rounding)', () {
    final t = [txn('10000.001', TxnType.expense, now)];
    expect(calc.total(t), Decimal.parse('-10000.001'));
  });

  test('income adds, expense subtracts', () {
    final t = [
      txn('500', TxnType.income, now),
      txn('200', TxnType.expense, now),
    ];
    expect(calc.total(t), Decimal.parse('300'));
  });

  test('summary filters strictly within the window', () {
    final t = [
      txn('1000', TxnType.income, now), // in window
      txn('300', TxnType.expense, now.subtract(const Duration(days: 2))), // in
      txn('999', TxnType.expense, now.subtract(const Duration(days: 40))), // out (1M)
    ];
    final s = calc.summary(t, TimeWindow.oneMonth, now: now);
    expect(s.income, Decimal.parse('1000'));
    expect(s.expense, Decimal.parse('300'));
    expect(s.net, Decimal.parse('700'));
  });

  test('series opening balance includes pre-window transactions', () {
    final t = [
      txn('1000', TxnType.income, now.subtract(const Duration(days: 100))), // opening
      txn('100', TxnType.expense, now), // today
    ];
    final pts = calc.series(t, TimeWindow.sevenDays, now: now);
    // First point reflects opening (1000), last reflects 1000 - 100 = 900.
    expect(pts.first.value, Decimal.parse('1000'));
    expect(pts.last.value, Decimal.parse('900'));
  });

  test('series spans the whole window inclusively (7D → 8 daily points)', () {
    final pts = calc.series([], TimeWindow.sevenDays, now: now);
    expect(pts.length, 8); // start day .. end day inclusive
    expect(pts.every((p) => p.value == Decimal.zero), isTrue);
  });

  test('series is monotonic in date', () {
    final pts = calc.series([], TimeWindow.oneMonth, now: now);
    for (var i = 1; i < pts.length; i++) {
      expect(pts[i].date.isAfter(pts[i - 1].date), isTrue);
    }
  });
}
