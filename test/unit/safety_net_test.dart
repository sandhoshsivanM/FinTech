import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:fintech_os/domain/entities/goal.dart';
import 'package:fintech_os/domain/entities/holding.dart';
import 'package:fintech_os/domain/entities/insurance.dart';
import 'package:fintech_os/domain/entities/transaction.dart';
import 'package:fintech_os/domain/services/safety_net.dart';

Decimal d(int v) => Decimal.fromInt(v);

final _now = DateTime(2023, 11, 15);
int _id = 0;
String _uid() => 'id${++_id}';

Txn _txn(int amount, TxnType type, int daysAgo) => Txn(
      id: _uid(),
      vaultId: 'v',
      amount: d(amount),
      type: type,
      categoryId: 'c',
      date: _now.subtract(Duration(days: daysAgo)),
      createdAt: _now,
    );

Goal _goal(int current, int target,
        [GoalType type = GoalType.emergencyFund]) =>
    Goal(
      id: _uid(),
      vaultId: 'v',
      name: 'EF',
      goalType: type,
      targetAmount: d(target),
      currentAmount: d(current),
    );

Holding _holding(AssetType type, int qty, int price, [int? last]) => Holding(
      id: _uid(),
      vaultId: 'v',
      symbol: type.key.toUpperCase(),
      exchange: 'NSE',
      quantity: d(qty),
      avgCost: d(price),
      firstPurchaseDate: _now,
      assetType: type,
      lastPrice: last == null ? null : d(last),
    );

Insurance _ins(InsuranceType type, int cover, [int premium = 1000]) => Insurance(
      id: _uid(),
      vaultId: 'v',
      name: type.key,
      type: type,
      coverAmount: d(cover),
      premium: d(premium),
    );

void main() {
  const svc = SafetyNetService();

  test('all four pillars covered → score 100, Excellent', () {
    final sn = svc.compute(
      [_txn(1000000, TxnType.income, 30)],
      [_goal(600000, 600000)],
      [_ins(InsuranceType.life, 10000000), _ins(InsuranceType.health, 500000)],
      [_holding(AssetType.fd, 1, 1000000)],
      now: _now,
    );
    expect(sn.score, 100);
    expect(sn.grade, 'Excellent');
    expect(sn.summary, contains('well protected'));
    expect(sn.components, hasLength(4));
  });

  test('empty inputs → score 25 (zero income makes life cover vacuously 100%)',
      () {
    final sn = svc.compute(const [], const [], const [], const [], now: _now);
    expect(sn.score, 25);
    expect(sn.grade, 'At risk');
    expect(
      sn.components.firstWhere((c) => c.key == 'emergency').detail,
      contains('No emergency-fund goal'),
    );
    expect(sn.summary.toLowerCase(), contains('biggest gap'));
  });

  test('emergency target falls back to 6× monthly expense when no goal target',
      () {
    final sn = svc.compute(
      [_txn(30000, TxnType.expense, 10)], // 90d expense 30k → monthly 10k
      [_goal(30000, 0)],
      const [],
      const [],
      now: _now,
    );
    final ef = sn.components.firstWhere((c) => c.key == 'emergency');
    expect(ef.recommended, d(60000));
    expect(ef.current, d(30000));
    expect(ef.coveredPct.round(), 50);
    expect(sn.monthsCovered, closeTo(3, 1e-6));
  });

  test('explicit goal target overrides the 6× fallback', () {
    final sn = svc.compute(
      [_txn(30000, TxnType.expense, 10)],
      [_goal(50000, 200000)],
      const [],
      const [],
      now: _now,
    );
    final ef = sn.components.firstWhere((c) => c.key == 'emergency');
    expect(ef.recommended, d(200000));
    expect(ef.coveredPct.round(), 25);
  });

  test('retirement counts only FD/PPF·EPF/NPS and uses lastPrice ?? avgCost',
      () {
    final sn = svc.compute(
      [_txn(1000000, TxnType.income, 30)],
      const [],
      const [],
      [
        _holding(AssetType.fd, 1, 999, 300000), // lastPrice wins
        _holding(AssetType.ppfEpf, 1, 200000), // avgCost fallback
        _holding(AssetType.equityEtf, 100, 100000), // ignored
      ],
      now: _now,
    );
    final r = sn.components.firstWhere((c) => c.key == 'retirement');
    expect(r.current, d(500000));
    expect(r.coveredPct.round(), 50);
  });

  test('weights: emergency 35 + retirement 15 land independently', () {
    final sn = svc.compute(
      [_txn(1000000, TxnType.income, 30)],
      [_goal(100000, 100000)],
      const [],
      [_holding(AssetType.fd, 1, 1000000)],
      now: _now,
    );
    expect(sn.score, 50);
    expect(sn.grade, 'Needs work');
  });

  test('weights: life 25 + health 25 land independently', () {
    final sn = svc.compute(
      [_txn(1000000, TxnType.income, 30)],
      const [],
      [_ins(InsuranceType.life, 10000000), _ins(InsuranceType.health, 500000)],
      const [],
      now: _now,
    );
    expect(sn.score, 50);
  });

  test('grade band: three pillars covered → 85, Excellent boundary', () {
    final sn = svc.compute(
      [_txn(1000000, TxnType.income, 30)],
      [_goal(600000, 600000)],
      [_ins(InsuranceType.life, 10000000), _ins(InsuranceType.health, 500000)],
      const [], // retirement 0 → 85
      now: _now,
    );
    expect(sn.score, 85);
    expect(sn.grade, 'Excellent');
  });
}
