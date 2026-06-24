import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:fintech_os/domain/entities/goal.dart';
import 'package:fintech_os/domain/entities/transaction.dart';
import 'package:fintech_os/domain/services/insights_engine.dart';

Decimal d(int v) => Decimal.fromInt(v);

Txn _txn(int amount, TxnType type, DateTime date, {String cat = 'c'}) => Txn(
      id: 'id-$amount-${date.millisecondsSinceEpoch}-$cat',
      vaultId: 'v',
      amount: d(amount),
      type: type,
      categoryId: cat,
      date: date,
      createdAt: date,
    );

void main() {
  const engine = InsightsEngine();
  final now = DateTime(2026, 6, 15);

  test('flags a spending anomaly vs trailing average', () {
    final txns = [
      _txn(5000, TxnType.expense, DateTime(2026, 6, 10), cat: 'food'),
      _txn(1000, TxnType.expense, DateTime(2026, 5, 10), cat: 'food'),
      _txn(1000, TxnType.expense, DateTime(2026, 4, 10), cat: 'food'),
      _txn(1000, TxnType.expense, DateTime(2026, 3, 10), cat: 'food'),
    ];
    final a = engine.spendingAnomalies(txns, now: now);
    expect(a.length, 1);
    expect(a.first.categoryId, 'food');
    expect(a.first.ratio, closeTo(5.0, 0.001));
  });

  test('safe-to-spend = income − expense − upcoming, over days left', () {
    final txns = [
      _txn(100000, TxnType.income, DateTime(2026, 6, 1)),
      _txn(30000, TxnType.expense, DateTime(2026, 6, 5)),
    ];
    final s = engine.safeToSpend(txns, const [], now: now);
    expect(s.remaining, d(70000));
    expect(s.daysLeft, greaterThan(0));
    expect(s.perDay > Decimal.zero, isTrue);
  });

  test('required monthly SIP hits target by date; null without a date', () {
    final goal = Goal(
      id: 'g', vaultId: 'v', name: 'Car', goalType: GoalType.values.first,
      targetAmount: d(120000), currentAmount: Decimal.zero,
      targetDate: DateTime(2027, 6, 15),
    );
    final sip = engine.requiredMonthlySip(goal, now: now);
    expect(sip, isNotNull);
    expect(sip! >= d(9000) && sip <= d(11000), isTrue);

    final noDate = Goal(
      id: 'g2', vaultId: 'v', name: 'X', goalType: GoalType.values.first,
      targetAmount: d(1000), currentAmount: Decimal.zero,
    );
    expect(engine.requiredMonthlySip(noDate, now: now), isNull);
  });
}
