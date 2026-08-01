import 'package:decimal/decimal.dart';

import '../entities/investment_totals.dart';
import '../entities/liability.dart';
import '../entities/transaction.dart';
import 'net_worth_calculator.dart';

/// One weighted pillar of the financial-health score.
class HealthPillar {
  const HealthPillar(this.key, this.label, this.score, this.max, this.detail);
  final String key;
  final String label;
  final double score; // 0..max
  final double max;
  final String detail;
}

/// Financial Health Score (0–100) — mirrors the web app. Pure Dart, no Flutter.
class HealthScore {
  const HealthScore({
    required this.score,
    required this.grade,
    required this.pillars,
    required this.summary,
  });
  final int score;
  final String grade;
  final List<HealthPillar> pillars;
  final String summary;
}

/// Four-pillar health score: savings rate, emergency buffer, debt load,
/// investing. Each returns a 0..max sub-score with an explanation.
class FinancialHealth {
  const FinancialHealth();

  static String _grade(int score) {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Strong';
    if (score >= 55) return 'Fair';
    if (score >= 40) return 'Needs work';
    return 'At risk';
  }

  static double _clamp01(double v) => v < 0 ? 0 : (v > 1 ? 1 : v);

  HealthScore compute(
    List<Txn> txns,
    InvestmentTotals investments,
    List<Liability> liabilities, {
    DateTime? now,
  }) {
    const calc = NetWorthCalculator();
    final s90 = calc.summary(txns, TimeWindow.threeMonths, now: now);
    final monthlyExpense = s90.expense.toDouble() / 3;
    final netWorth = calc.total(txns).toDouble();
    final invest = investments.marketValue.toDouble();
    final debt = liabilities
        .fold(Decimal.zero, (s, l) => s + l.principal)
        .toDouble();

    final income90 = s90.income.toDouble();
    final savingsRate = income90 == 0 ? 0.0 : s90.net.toDouble() / income90;
    final p1 = _clamp01(savingsRate / 0.3) * 30;

    final months = monthlyExpense <= 0
        ? (netWorth > 0 ? 6.0 : 0.0)
        : netWorth / monthlyExpense;
    final p2 = _clamp01(months / 6) * 25;

    final assets = netWorth + invest;
    final dti = assets <= 0 ? (debt > 0 ? 1.0 : 0.0) : _clamp01(debt / assets);
    final p3 = (1 - dti) * 25;

    final investRatio =
        assets <= 0 ? 0.0 : _clamp01((invest / assets) / 0.4);
    final p4 = investRatio * 20;

    final pillars = <HealthPillar>[
      HealthPillar('savings', 'Savings rate', p1, 30,
          '${(savingsRate * 100).round()}% of income saved (90d)'),
      HealthPillar('buffer', 'Emergency buffer', p2, 25,
          '${months.toStringAsFixed(1)} months of expenses covered'),
      HealthPillar('debt', 'Debt load', p3, 25,
          '${(dti * 100).round()}% debt-to-asset ratio'),
      HealthPillar('investing', 'Investing', p4, 20,
          invest > 0
              ? '${(assets <= 0 ? 0 : (invest / assets * 100)).round()}% of assets invested'
              : 'No investments tracked yet'),
    ];

    final total = pillars.fold(0.0, (s, p) => s + p.score).round();
    final weakest = [...pillars]
      ..sort((a, b) => (a.score / a.max).compareTo(b.score / b.max));
    final summary = total >= 70
        ? "You're in ${_grade(total).toLowerCase()} shape. Keep it up — your strongest area is carrying you."
        : 'Biggest opportunity: ${weakest.first.label.toLowerCase()}. Small improvements here lift your score fastest.';

    return HealthScore(
      score: total,
      grade: _grade(total),
      pillars: pillars,
      summary: summary,
    );
  }
}
