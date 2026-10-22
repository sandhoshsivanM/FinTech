import 'package:decimal/decimal.dart';

import '../entities/goal.dart';
import '../entities/investment_totals.dart';
import '../entities/insurance.dart';
import '../entities/transaction.dart';
import 'insurance_advisor.dart';
import 'net_worth_calculator.dart';

/// "Safety Net" readiness — aggregates emergency fund (Goals), insurance cover
/// (Insurance), and safe/retirement assets (Holdings) into one 0–100 score.
///
/// Pure Dart, no Flutter imports. Mirrors the web app's `domain/safetyNet.ts`
/// (same weights, grade bands, and heuristics) so both platforms agree.
class SafetyComponent {
  const SafetyComponent({
    required this.key,
    required this.label,
    required this.current,
    required this.recommended,
    required this.gap,
    required this.coveredPct,
    required this.detail,
  });

  final String key; // 'emergency' | 'life' | 'health' | 'retirement'
  final String label;
  final Decimal current;
  final Decimal recommended;
  final Decimal gap; // max(0, recommended − current)
  final double coveredPct; // 0..100+ (clamped to 100 for scoring)
  final String detail;
}

class SafetyNet {
  const SafetyNet({
    required this.score,
    required this.grade,
    required this.summary,
    required this.components,
    required this.premium,
    required this.monthsCovered,
    required this.annualIncome,
  });

  final int score; // 0..100
  final String grade;
  final String summary;
  final List<SafetyComponent> components;
  final Decimal premium; // total annual insurance premium
  final double monthsCovered; // emergency fund ÷ monthly expense
  final Decimal annualIncome;
}

class SafetyNetService {
  const SafetyNetService();

  // Weights sum to 100 — must match safetyNet.ts.
  static const int wEmergency = 35;
  static const int wLife = 25;
  static const int wHealth = 25;
  static const int wRetirement = 15;
  static const int emergencyMonthsTarget = 6;

  static String _grade(int score) {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Strong';
    if (score >= 55) return 'Fair';
    if (score >= 40) return 'Needs work';
    return 'At risk';
  }

  static double _clamp01(double v) => v < 0 ? 0 : (v > 1 ? 1 : v);

  static Decimal _maxZero(Decimal v) => v > Decimal.zero ? v : Decimal.zero;

  /// [investments] supplies the safe/retirement asset value. It replaced a
  /// `List<Holding>` that this service only ever filtered down to FD/PPF/NPS
  /// and summed — a computation that now lives once, in [InvestmentTotals],
  /// where it is derived from the lot model rather than the legacy table.
  SafetyNet compute(
    List<Txn> txns,
    List<Goal> goals,
    List<Insurance> insurances,
    InvestmentTotals investments, {
    DateTime? now,
  }) {
    final end = now ?? DateTime.now();
    const advisor = InsuranceAdvisor();
    const nwc = NetWorthCalculator();

    // Bases shared with the Insurance page / health score.
    final s90 = nwc.summary(txns, TimeWindow.threeMonths, now: end);
    final monthlyExpense =
        (s90.expense / Decimal.fromInt(3)).toDecimal(scaleOnInfinitePrecision: 20);
    final yearStart = end.subtract(const Duration(days: 365));
    final annualIncome = txns
        .where((t) => t.type == TxnType.income && !t.date.isBefore(yearStart))
        .fold(Decimal.zero, (s, t) => s + t.amount);

    // ---- Emergency fund ----
    final efGoals =
        goals.where((g) => g.goalType == GoalType.emergencyFund).toList();
    final efFund =
        efGoals.fold(Decimal.zero, (s, g) => s + g.currentAmount);
    final efGoalTarget =
        efGoals.fold(Decimal.zero, (s, g) => s + g.targetAmount);
    // Target: explicit goal target, else 6× monthly expense.
    final efTarget = efGoalTarget > Decimal.zero
        ? efGoalTarget
        : monthlyExpense * Decimal.fromInt(emergencyMonthsTarget);
    final monthsCovered = monthlyExpense > Decimal.zero
        ? efFund.toDouble() / monthlyExpense.toDouble()
        : (efFund > Decimal.zero ? emergencyMonthsTarget.toDouble() : 0.0);
    final efPct = efTarget > Decimal.zero
        ? efFund.toDouble() / efTarget.toDouble() * 100
        : (efFund > Decimal.zero ? 100.0 : 0.0);
    final emergency = SafetyComponent(
      key: 'emergency',
      label: 'Emergency fund',
      current: efFund,
      recommended: efTarget,
      gap: _maxZero(efTarget - efFund),
      coveredPct: efPct,
      detail: efGoals.isEmpty
          ? 'No emergency-fund goal yet — aim for ~6 months of expenses.'
          : '${monthsCovered.toStringAsFixed(1)} of $emergencyMonthsTarget months of expenses covered.',
    );

    // ---- Insurance cover (reuse the gap engine) ----
    final gaps = advisor.coverageGaps(insurances, annualIncome);
    final lifeGap = gaps.firstWhere((g) => g.kind == 'life');
    final healthGap = gaps.firstWhere((g) => g.kind == 'health');
    final life = SafetyComponent(
      key: 'life',
      label: 'Life cover',
      current: lifeGap.current,
      recommended: lifeGap.recommended,
      gap: lifeGap.gap,
      coveredPct: lifeGap.coveredPct.toDouble(),
      detail: lifeGap.gap > Decimal.zero
          ? 'Below the 10× annual-income guideline.'
          : 'Meets the guideline.',
    );
    final health = SafetyComponent(
      key: 'health',
      label: 'Health cover',
      current: healthGap.current,
      recommended: healthGap.recommended,
      gap: healthGap.gap,
      coveredPct: healthGap.coveredPct.toDouble(),
      detail: healthGap.gap > Decimal.zero
          ? 'Below the ₹5L / half-income guideline.'
          : 'Meets the guideline.',
    );

    // ---- Safe / retirement assets (FD, PPF·EPF, NPS) ----
    final retireValue = investments.retirementValue;
    // Heuristic: ~1 year of income parked safely = fully covered.
    final retirePct = annualIncome > Decimal.zero
        ? _clamp01(retireValue.toDouble() / annualIncome.toDouble()) * 100
        : (retireValue > Decimal.zero ? 100.0 : 0.0);
    final retirement = SafetyComponent(
      key: 'retirement',
      label: 'Safe & retirement assets',
      current: retireValue,
      recommended: annualIncome,
      gap: _maxZero(annualIncome - retireValue),
      coveredPct: retirePct,
      detail: retireValue > Decimal.zero
          ? 'FD / PPF·EPF / NPS tracked.'
          : 'No FD / PPF / NPS tracked yet.',
    );

    final components = [emergency, life, health, retirement];

    final score = (_clamp01(emergency.coveredPct / 100) * wEmergency +
            _clamp01(life.coveredPct / 100) * wLife +
            _clamp01(health.coveredPct / 100) * wHealth +
            _clamp01(retirement.coveredPct / 100) * wRetirement)
        .round();

    final weakest = [...components]
      ..sort((a, b) => a.coveredPct.compareTo(b.coveredPct));
    final summary = score >= 70
        ? 'Your safety net is ${_grade(score).toLowerCase()} — well protected against surprises.'
        : 'Biggest gap: ${weakest.first.label.toLowerCase()}. Closing it strengthens your safety net the most.';

    return SafetyNet(
      score: score,
      grade: _grade(score),
      summary: summary,
      components: components,
      premium: advisor.annualPremiumTotal(insurances),
      monthsCovered: monthsCovered,
      annualIncome: annualIncome,
    );
  }
}
