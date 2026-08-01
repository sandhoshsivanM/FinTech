import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/domain/entities/goal.dart';
import 'package:khazana/domain/entities/holding.dart';
import 'package:khazana/domain/entities/insurance.dart';
import 'package:khazana/domain/entities/transaction.dart';
import 'package:khazana/domain/services/safety_net.dart';

import '../support/investment_totals_builder.dart';

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
      totalsOf({AssetType.fd: 1000000}),
      now: _now,
    );
    expect(sn.score, 100);
    expect(sn.grade, 'Excellent');
    expect(sn.summary, contains('well protected'));
    expect(sn.components, hasLength(4));
  });

  test('empty inputs → score 25 (zero income makes life cover vacuously 100%)',
      () {
    final sn = svc.compute(const [], const [], const [], noInvestments, now: _now);
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
      noInvestments,
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
      noInvestments,
      now: _now,
    );
    final ef = sn.components.firstWhere((c) => c.key == 'emergency');
    expect(ef.recommended, d(200000));
    expect(ef.coveredPct.round(), 25);
  });

  test('retirement counts only the retirement asset group', () {
    final sn = svc.compute(
      [_txn(1000000, TxnType.income, 30)],
      const [],
      const [],
      // Equity is in the portfolio but not in the retirement group, so it must
      // not count toward "safe assets" — that grouping is now InvestmentTotals'
      // job rather than a filter repeated inside this service.
      totalsOf({
        AssetType.fd: 300000,
        AssetType.ppfEpf: 200000,
        AssetType.equityEtf: 10000000,
      }),
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
      totalsOf({AssetType.fd: 1000000}),
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
      noInvestments,
      now: _now,
    );
    expect(sn.score, 50);
  });

  test('grade band: three pillars covered → 85, Excellent boundary', () {
    final sn = svc.compute(
      [_txn(1000000, TxnType.income, 30)],
      [_goal(600000, 600000)],
      [_ins(InsuranceType.life, 10000000), _ins(InsuranceType.health, 500000)],
      noInvestments, // retirement 0 → 85
      now: _now,
    );
    expect(sn.score, 85);
    expect(sn.grade, 'Excellent');
  });
}
