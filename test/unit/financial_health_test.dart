import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:fintech_os/domain/entities/holding.dart';
import 'package:fintech_os/domain/entities/liability.dart';
import 'package:fintech_os/domain/entities/transaction.dart';
import 'package:fintech_os/domain/services/financial_health.dart';

Decimal d(int v) => Decimal.fromInt(v);

Txn _txn(int amount, TxnType type, DateTime date) => Txn(
      id: 'id-$amount-${date.millisecondsSinceEpoch}',
      vaultId: 'v',
      amount: d(amount),
      type: type,
      categoryId: 'c',
      date: date,
      createdAt: date,
    );

void main() {
  const fh = FinancialHealth();
  final now = DateTime(2026, 6, 15);

  test('score is bounded 0..100 with 4 pillars', () {
    final res = fh.compute(const [], const [], const [], now: now);
    expect(res.score, inInclusiveRange(0, 100));
    expect(res.pillars.length, 4);
    expect(res.grade, isNotEmpty);
    expect(res.summary, isNotEmpty);
  });

  test('healthy profile (high savings, invested, no debt) scores well', () {
    final txns = [
      _txn(300000, TxnType.income, DateTime(2026, 5, 1)),
      _txn(60000, TxnType.expense, DateTime(2026, 5, 5)),
    ];
    final holdings = [
      Holding(
        id: 'h1', vaultId: 'v', symbol: 'NIFTYBEES', exchange: 'NSE',
        quantity: d(100), avgCost: d(2000),
        firstPurchaseDate: DateTime(2024, 1, 1), lastPrice: d(2500),
      ),
    ];
    final res = fh.compute(txns, holdings, const [], now: now);
    expect(res.score, greaterThan(60));
  });

  test('heavy debt drags the debt pillar down', () {
    final txns = [_txn(100000, TxnType.income, DateTime(2026, 5, 1))];
    final liabs = [
      Liability(
        id: 'l1', vaultId: 'v', name: 'Loan',
        kind: LiabilityKind.loan, principal: d(5000000), aprPct: d(12),
      ),
    ];
    final res = fh.compute(txns, const [], liabs, now: now);
    final debtPillar = res.pillars.firstWhere((p) => p.key == 'debt');
    expect(debtPillar.score, lessThan(debtPillar.max));
  });
}
