import 'dart:convert';
import 'dart:io';

import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/domain/entities/budget.dart';
import 'package:khazana/domain/entities/goal.dart';
import 'package:khazana/domain/entities/holding.dart';
import 'package:khazana/domain/entities/insurance.dart';
import 'package:khazana/domain/entities/liability.dart';
import 'package:khazana/domain/entities/net_worth_snapshot.dart';
import 'package:khazana/domain/entities/transaction.dart';
import 'package:khazana/domain/services/financial_health.dart';

import '../support/investment_totals_builder.dart';

Decimal d(int v) => Decimal.fromInt(v);

final _now = DateTime.utc(2026, 6, 15);
int _seq = 0;
String _uid() => 'id${++_seq}';

Txn _txn(int amount, TxnType type, int daysAgo, {String categoryId = 'c'}) =>
    Txn(
      id: _uid(),
      vaultId: 'v',
      amount: d(amount),
      type: type,
      categoryId: categoryId,
      date: _now.subtract(Duration(days: daysAgo)),
      createdAt: _now,
    );

Liability _liab(int principal, int apr) => Liability(
      id: _uid(),
      vaultId: 'v',
      name: 'L',
      kind: LiabilityKind.loan,
      principal: d(principal),
      aprPct: d(apr),
    );

Insurance _ins(InsuranceType type, int cover) => Insurance(
      id: _uid(),
      vaultId: 'v',
      name: type.key,
      type: type,
      coverAmount: d(cover),
      premium: d(10000),
    );

Goal _goal(GoalType type, int target, int current, {DateTime? due}) => Goal(
      id: _uid(),
      vaultId: 'v',
      name: 'G',
      goalType: type,
      targetAmount: d(target),
      currentAmount: d(current),
      targetDate: due,
    );

Budget _budget(String categoryId, int limit) => Budget(
      id: _uid(),
      vaultId: 'v',
      categoryId: categoryId,
      amountLimit: d(limit),
    );

void main() {
  const fh = FinancialHealth();

  HealthScore score({
    List<Txn> txns = const [],
    Map<AssetType, int> investments = const {},
    List<Liability> liabilities = const [],
    List<Insurance> insurances = const [],
    List<Goal> goals = const [],
    List<Budget> budgets = const [],
    List<NetWorthSnapshot> snapshots = const [],
  }) =>
      fh.compute(HealthInputs(
        txns: txns,
        investments:
            investments.isEmpty ? noInvestments : totalsOf(investments),
        liabilities: liabilities,
        insurances: insurances,
        goals: goals,
        budgets: budgets,
        snapshots: snapshots,
        now: _now,
      ));

  HealthCategory categoryOf(HealthScore s, String key) =>
      s.categories.firstWhere((c) => c.key == key);

  double? metricOf(HealthScore s, String category, String metric) =>
      categoryOf(s, category).metrics.firstWhere((m) => m.key == metric).value;

  group('shape', () {
    test('always returns the four categories in a fixed order', () {
      expect(score().categories.map((c) => c.key).toList(),
          ['wealth', 'protection', 'efficiency', 'future']);
    });

    test('category weights sum to 100', () {
      expect(score().categories.fold(0.0, (a, c) => a + c.weight), 100.0);
    });

    test('every metric carries a sentence in both states', () {
      for (final s in [
        score(),
        score(txns: [_txn(100000, TxnType.income, 30)]),
      ]) {
        for (final c in s.categories) {
          expect(c.detail, isNotEmpty, reason: '${c.key} has no detail');
          for (final m in c.metrics) {
            expect(m.detail, isNotEmpty, reason: '${m.key} has no detail');
          }
        }
      }
    });
  });

  group('not yet tracked', () {
    test('an empty vault has no score, no grade, nothing tracked', () {
      final s = score();
      expect(s.score, isNull, reason: 'an empty vault must not score 0');
      expect(s.grade, isNull);
      expect(s.trackedWeight, 0);
      expect(s.trackedCategoryCount, 0);
      for (final c in s.categories) {
        expect(c.isTracked, isFalse);
        expect(c.score, isNull, reason: '${c.key} scored instead of abstaining');
        expect(c.fraction, isNull);
      }
    });

    test('no insurance means Protection is untracked, NOT zero', () {
      // The distinction this design exists for: a user with no policies on file
      // is not a user with bad cover. The app has simply not been told.
      final s = score(
        txns: [
          _txn(300000, TxnType.income, 45),
          _txn(150000, TxnType.expense, 40),
        ],
        investments: {AssetType.equityEtf: 500000},
      );
      expect(metricOf(s, 'protection', 'protection.life'), isNull);
      expect(metricOf(s, 'protection', 'protection.health'), isNull);
    });

    test('an untracked category is excluded from the denominator', () {
      final s = score(
        txns: [
          _txn(300000, TxnType.income, 45),
          _txn(150000, TxnType.expense, 40),
        ],
        investments: {AssetType.equityEtf: 500000, AssetType.fd: 300000},
        goals: [_goal(GoalType.vacation, 200000, 150000)],
      );
      // Wealth 30 + Efficiency 25 + Future 20 = 75; Protection has no data.
      expect(categoryOf(s, 'protection').isTracked, isFalse);
      expect(s.trackedWeight, 75);
      expect(s.isPartial, isTrue);
      expect(s.trackedCategoryCount, 3);
    });

    test('the score is out of what is tracked, not out of 100', () {
      // Capping at the untracked weight instead would read as "At risk" for a
      // user who is simply mid-table on everything actually measured.
      final s = score(txns: [
        _txn(300000, TxnType.income, 45),
        _txn(150000, TxnType.expense, 40),
      ]);
      final tracked = s.categories.where((c) => c.isTracked).toList();
      final earned = tracked.fold(0.0, (a, c) => a + c.score!);
      expect(s.score, (earned / s.trackedWeight * 100).round());
      expect(s.score, inInclusiveRange(0, 100));
    });

    test('a category with one tracked metric renormalises within itself', () {
      // Only budget adherence is tracked in Efficiency here — no income means
      // no savings rate, no assets or liabilities means no debt ratio. The
      // category's score must come out of its own weight, not be diluted by
      // the two metrics it could not measure.
      final s = score(
        txns: [_txn(4000, TxnType.expense, 2, categoryId: 'food')],
        budgets: [_budget('food', 8000)],
      );
      final eff = categoryOf(s, 'efficiency');
      expect(metricOf(s, 'efficiency', 'efficiency.savings_rate'), isNull);
      expect(eff.fraction, 1.0, reason: 'the one tracked metric is at full');
      expect(eff.score, eff.weight);
    });
  });

  group('grading', () {
    test('grade bands are unchanged: 85 / 70 / 55 / 40', () {
      expect(FinancialHealth.gradeOf(85), 'Excellent');
      expect(FinancialHealth.gradeOf(84), 'Strong');
      expect(FinancialHealth.gradeOf(70), 'Strong');
      expect(FinancialHealth.gradeOf(69), 'Fair');
      expect(FinancialHealth.gradeOf(55), 'Fair');
      expect(FinancialHealth.gradeOf(54), 'Needs work');
      expect(FinancialHealth.gradeOf(40), 'Needs work');
      expect(FinancialHealth.gradeOf(39), 'At risk');
    });

    test('too little tracked to grade still yields an honest number', () {
      final s = score(txns: [_txn(300000, TxnType.income, 45)]);
      if (s.trackedWeight < FinancialHealth.minGradableWeight) {
        expect(s.grade, isNull,
            reason: 'one category out of four cannot support a verdict');
        expect(s.score, isNotNull);
      }
    });

    test('a fully tracked vault is graded', () {
      final s = score(
        txns: [
          _txn(1200000, TxnType.income, 200),
          _txn(300000, TxnType.income, 45),
          _txn(150000, TxnType.expense, 40),
        ],
        investments: {AssetType.equityEtf: 800000, AssetType.fd: 400000},
        liabilities: [_liab(100000, 9)],
        insurances: [
          _ins(InsuranceType.life, 15000000),
          _ins(InsuranceType.health, 1000000),
        ],
        goals: [
          _goal(GoalType.emergencyFund, 300000, 300000),
          _goal(GoalType.vacation, 200000, 100000),
        ],
      );
      expect(s.trackedWeight, 100);
      expect(s.isPartial, isFalse);
      expect(s.grade, isNotNull);
      expect(s.score, inInclusiveRange(0, 100));
    });

    test('the summary names the untracked areas rather than hiding them', () {
      final s = score(
        txns: [
          _txn(300000, TxnType.income, 45),
          _txn(150000, TxnType.expense, 40),
        ],
        investments: {AssetType.equityEtf: 500000},
        goals: [_goal(GoalType.vacation, 200000, 150000)],
      );
      expect(s.summary.toLowerCase(), contains('protection'));
      expect(s.summary.toLowerCase(), contains('not tracked'));
    });
  });

  group('metrics', () {
    test('high-APR debt scores below the same balance at a low rate', () {
      List<Txn> t() => [
            _txn(300000, TxnType.income, 45),
            _txn(150000, TxnType.expense, 40),
          ];
      const inv = {AssetType.equityEtf: 500000};
      final cheap =
          score(txns: t(), investments: inv, liabilities: [_liab(100000, 9)]);
      final dear =
          score(txns: t(), investments: inv, liabilities: [_liab(100000, 42)]);
      expect(metricOf(dear, 'efficiency', 'efficiency.debt_load')!,
          lessThan(metricOf(cheap, 'efficiency', 'efficiency.debt_load')!),
          reason: 'a 42% balance compounds faster than the same 9% balance');
    });

    test('one asset group scores worse than a spread', () {
      double diversification(Map<AssetType, int> inv) => metricOf(
            score(txns: [_txn(300000, TxnType.income, 45)], investments: inv),
            'wealth',
            'wealth.concentration',
          )!;
      expect(
        diversification({
          AssetType.equityEtf: 400000,
          AssetType.goldEtf: 300000,
          AssetType.fd: 300000,
        }),
        greaterThan(diversification({AssetType.equityEtf: 1000000})),
      );
    });

    test('budget adherence counts budgets still inside their limit', () {
      final s = score(
        txns: [
          _txn(300000, TxnType.income, 45),
          _txn(9000, TxnType.expense, 2, categoryId: 'food'),
        ],
        budgets: [_budget('food', 8000), _budget('transport', 3000)],
      );
      expect(metricOf(s, 'efficiency', 'efficiency.budget_adherence'), 0.5,
          reason: 'one of two budgets is overspent');
      expect(
        categoryOf(s, 'efficiency')
            .metrics
            .firstWhere((m) => m.key == 'efficiency.budget_adherence')
            .detail,
        contains('1 of 2'),
      );
    });

    test('an overspent budget is not rounded back to "at limit"', () {
      // BudgetProgress.fraction caps at 1 for the progress bar, so comparing
      // fractions would make every overspend read as exactly on target.
      final s = score(
        txns: [_txn(80000, TxnType.expense, 2, categoryId: 'food')],
        budgets: [_budget('food', 8000)],
      );
      expect(metricOf(s, 'efficiency', 'efficiency.budget_adherence'), 0.0);
    });

    test('overdue unfunded goals score below the same goals with time left',
        () {
      double pace(DateTime? due) => metricOf(
            score(goals: [_goal(GoalType.vacation, 200000, 50000, due: due)]),
            'future',
            'future.goal_pace',
          )!;
      expect(pace(_now.subtract(const Duration(days: 30))),
          lessThan(pace(_now.add(const Duration(days: 200)))));
    });

    test('emergency-fund goals do not also count toward Future', () {
      // Otherwise one goal moves two categories, and a user with a single
      // emergency fund reads as if they were building a future too.
      final s = score(
        goals: [_goal(GoalType.emergencyFund, 300000, 300000)],
        txns: [_txn(300000, TxnType.income, 45)],
      );
      expect(metricOf(s, 'future', 'future.goal_pace'), isNull);
    });

    test('net-worth trajectory prefers real snapshots over the income proxy',
        () {
      NetWorthSnapshot snap(int daysAgo, int netWorth) => NetWorthSnapshot(
            id: 'snap-$daysAgo',
            vaultId: 'v',
            date: _now.subtract(Duration(days: daysAgo)),
            netWorth: d(netWorth),
            cash: d(netWorth),
            investments: Decimal.zero,
            liabilities: Decimal.zero,
          );

      final rising = score(
        txns: [_txn(300000, TxnType.income, 45)],
        snapshots: [snap(60, 1000000), snap(1, 1200000)],
      );
      final falling = score(
        txns: [_txn(300000, TxnType.income, 45)],
        snapshots: [snap(60, 1200000), snap(1, 1000000)],
      );
      expect(metricOf(rising, 'wealth', 'wealth.trajectory')!,
          greaterThan(metricOf(falling, 'wealth', 'wealth.trajectory')!));
      expect(
        categoryOf(rising, 'wealth')
            .metrics
            .firstWhere((m) => m.key == 'wealth.trajectory')
            .detail,
        contains('up'),
      );
    });

    test('trajectory is untracked with one snapshot and no income', () {
      final s = score(investments: {AssetType.equityEtf: 100000});
      expect(metricOf(s, 'wealth', 'wealth.trajectory'), isNull);
    });
  });

  group('shared fixture (parity with webapp/src/domain/health.ts)', () {
    // Both suites load this file and must agree. See its _comment block: the TS
    // score had no test at all before it, and the two portfolio models had
    // already drifted under exactly that arrangement.
    late Map<String, dynamic> fixture;

    setUpAll(() {
      fixture = jsonDecode(
              File('test/fixtures/health_cases.json').readAsStringSync())
          as Map<String, dynamic>;
    });

    test('the fixture pins the same "now" both suites use', () {
      expect(DateTime.parse(fixture['now'] as String), _now);
    });

    test('the two copies of the fixture are byte-identical', () {
      // Vitest cannot import from outside webapp/, so the file is duplicated
      // rather than symlinked. Duplicated files drift; this is what stops it.
      // If this fails, copy test/fixtures/health_cases.json over
      // webapp/src/domain/__fixtures__/health_cases.json.
      final dart = File('test/fixtures/health_cases.json').readAsBytesSync();
      final web =
          File('webapp/src/domain/__fixtures__/health_cases.json').readAsBytesSync();
      expect(web, dart,
          reason: 'the Dart and TypeScript suites are no longer asserting '
              'against the same cases, so the parity contract is not being '
              'checked');
    });

    HealthScore fromFixture(Map<String, dynamic> input) {
      final inv = <AssetType, int>{
        for (final e in ((input['investments'] as Map?) ?? const {}).entries)
          AssetType.fromKey(e.key as String): e.value as int,
      };
      return fh.compute(HealthInputs(
        txns: [
          for (final t in (input['txns'] as List? ?? const []))
            _txn(
              (t as Map)['amount'] as int,
              t['type'] == 'income' ? TxnType.income : TxnType.expense,
              t['daysAgo'] as int,
            ),
        ],
        investments: inv.isEmpty ? noInvestments : totalsOf(inv),
        liabilities: [
          for (final l in (input['liabilities'] as List? ?? const []))
            _liab((l as Map)['principal'] as int, l['apr'] as int),
        ],
        insurances: [
          for (final i in (input['insurances'] as List? ?? const []))
            _ins(InsuranceType.fromKey((i as Map)['type'] as String),
                i['cover'] as int),
        ],
        goals: [
          for (final g in (input['goals'] as List? ?? const []))
            _goal(GoalType.fromKey((g as Map)['type'] as String),
                g['target'] as int, g['current'] as int),
        ],
        now: _now,
      ));
    }

    test('every fixture case matches its expectations', () {
      for (final raw in fixture['cases'] as List) {
        final c = raw as Map<String, dynamic>;
        final name = c['name'] as String;
        final s = fromFixture(c['input'] as Map<String, dynamic>);
        final expected = c['expect'] as Map<String, dynamic>?;

        if (expected != null) {
          if (expected.containsKey('score')) {
            expect(s.score, expected['score'], reason: name);
          }
          if (expected.containsKey('grade')) {
            expect(s.grade, expected['grade'], reason: name);
          }
          if (expected.containsKey('trackedWeight')) {
            expect(s.trackedWeight,
                (expected['trackedWeight'] as num).toDouble(), reason: name);
          }
          if (expected.containsKey('trackedCategoryCount')) {
            expect(s.trackedCategoryCount, expected['trackedCategoryCount'],
                reason: name);
          }
          if (expected.containsKey('untracked')) {
            final actual = s.categories
                .where((c) => !c.isTracked)
                .map((c) => c.key)
                .toList()
              ..sort();
            final want = (expected['untracked'] as List).cast<String>().toList()
              ..sort();
            expect(actual, want, reason: name);
          }
          if (expected.containsKey('categories')) {
            for (final e in (expected['categories'] as Map).entries) {
              expect(categoryOf(s, e.key as String).score, e.value,
                  reason: '$name / ${e.key}');
            }
          }
        }

        final comparison = c['comparison'] as Map<String, dynamic>?;
        if (comparison != null) {
          final other =
              fromFixture(comparison['against'] as Map<String, dynamic>);
          if (comparison['expect'] == 'lower') {
            expect(s.score!, lessThan(other.score!), reason: name);
          } else {
            expect(s.score!, greaterThan(other.score!), reason: name);
          }
        }
      }
    });
  });
}
