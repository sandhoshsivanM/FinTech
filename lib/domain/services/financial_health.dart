import 'package:decimal/decimal.dart';

import '../entities/budget.dart';
import '../entities/goal.dart';
import '../entities/insurance.dart';
import '../entities/investment_totals.dart';
import '../entities/liability.dart';
import '../entities/net_worth_snapshot.dart';
import '../entities/transaction.dart';
import 'budget_calculator.dart';
import 'net_worth_calculator.dart';
import 'safety_net.dart';

/// One measurable inside a category.
///
/// [value] is `null` — never `0.0` — when the app has no data to judge this on.
/// That distinction is the whole point of the type: a user with no insurance and
/// a user with terrible insurance are not in the same position, and scoring both
/// as zero told them they were.
class HealthMetric {
  const HealthMetric({
    required this.key,
    required this.label,
    required this.weight,
    required this.value,
    required this.detail,
  });

  final String key;
  final String label;

  /// Relative weight inside its category. Only tracked metrics' weights count,
  /// so these need not sum to anything in particular.
  final double weight;

  /// Achievement, 0..1. Null means not tracked.
  final double? value;

  /// A sentence that reads correctly in both states.
  final String detail;

  bool get isTracked => value != null;
}

/// One of the four categories the score is built from.
class HealthCategory {
  const HealthCategory({
    required this.key,
    required this.label,
    required this.weight,
    required this.metrics,
    required this.detail,
  });

  /// 'wealth' | 'protection' | 'efficiency' | 'future'
  final String key;
  final String label;

  /// This category's share of the full 100.
  final double weight;

  final List<HealthMetric> metrics;
  final String detail;

  Iterable<HealthMetric> get trackedMetrics => metrics.where((m) => m.isTracked);

  bool get isTracked => trackedMetrics.isNotEmpty;

  /// Achievement across tracked metrics only, weights renormalised. Null when
  /// nothing in this category is tracked.
  double? get fraction {
    final tracked = trackedMetrics.toList();
    if (tracked.isEmpty) return null;
    final w = tracked.fold(0.0, (s, m) => s + m.weight);
    if (w <= 0) return null;
    return tracked.fold(0.0, (s, m) => s + m.value! * m.weight) / w;
  }

  /// Points earned out of [weight]. Null when untracked — not zero.
  double? get score {
    final f = fraction;
    return f == null ? null : f * weight;
  }
}

/// The Financial Health Score.
///
/// Four categories — Wealth, Protection, Efficiency, Future — renormalised over
/// whatever is actually tracked. Mirrors `webapp/src/domain/health.ts`; the two
/// are pinned to the same numbers by a shared fixture.
class HealthScore {
  const HealthScore({
    required this.score,
    required this.grade,
    required this.trackedWeight,
    required this.categories,
    required this.summary,
  });

  /// 0..100 over the tracked categories. Null when nothing is tracked at all.
  final int? score;

  /// Null below [minGradableWeight]. A grade derived from one category out of
  /// four is a verdict the data cannot support, which is the same dishonesty as
  /// a fabricated number, just wearing a word.
  final String? grade;

  /// Sum of tracked category weights, 0..100. Drives "based on 3 of 4 areas".
  final double trackedWeight;

  /// Always four, always in fixed order.
  final List<HealthCategory> categories;

  final String summary;

  bool get isPartial => trackedWeight < 100;
  bool get isGraded => grade != null;

  /// How many of the four categories have any data.
  int get trackedCategoryCount => categories.where((c) => c.isTracked).length;
}

/// Computes the four-category health score.
///
/// ## Why renormalise rather than cap
///
/// A user with excellent cash flow and no insurance policies has no Protection
/// data. Three ways to handle that:
///
///  * Score them 0 on Protection. That is a fabricated *failure* — the app is
///    asserting they are unprotected when it simply does not know.
///  * Cap the total at 75. That reads as "At risk" on a 0–100 gauge, punishing
///    the user for a module they have not filled in yet.
///  * Renormalise over what is tracked, and say so.
///
/// The third is the only one that does not put a number on the screen the data
/// cannot support. [trackedWeight] is what lets the UI show the denominator
/// alongside the score, and [HealthCategory.score] stays null so the category
/// card can render "Not yet tracked" instead of a bar at zero.
class FinancialHealth {
  const FinancialHealth({this.safetyNet = const SafetyNetService()});

  final SafetyNetService safetyNet;

  /// Below this much tracked weight, the score gets no grade. Two categories
  /// out of four is the minimum that can support a one-word verdict.
  static const double minGradableWeight = 50;

  static const double wealthWeight = 30;
  static const double protectionWeight = 25;
  static const double efficiencyWeight = 25;
  static const double futureWeight = 20;

  /// Grade bands, unchanged from the previous score so existing colour
  /// thresholds and the user's sense of what a number means both survive.
  static String gradeOf(int score) {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Strong';
    if (score >= 55) return 'Fair';
    if (score >= 40) return 'Needs work';
    return 'At risk';
  }

  static double _clamp01(double v) => v < 0 ? 0 : (v > 1 ? 1 : v);

  HealthScore compute(HealthInputs input) {
    final now = input.now ?? DateTime.now();
    const calc = NetWorthCalculator();

    final s90 = calc.summary(input.txns, TimeWindow.threeMonths, now: now);
    final income90 = s90.income.toDouble();
    final cash = calc.total(input.txns).toDouble();
    final invested = input.investments.marketValue.toDouble();
    final debt = input.liabilities
        .fold(Decimal.zero, (s, l) => s + l.principal)
        .toDouble();
    final assets = cash + invested;

    final yearStart = now.subtract(const Duration(days: 365));
    final annualIncome = input.txns
        .where((t) => t.type == TxnType.income && !t.date.isBefore(yearStart))
        .fold(Decimal.zero, (s, t) => s + t.amount)
        .toDouble();

    final hasLedger = input.txns.isNotEmpty;
    final hasPortfolio = !input.investments.isEmpty;

    // Protection and the retirement metric come from the safety-net service
    // rather than being recomputed here. One implementation of "how covered am
    // I", used by both the Score screen and the Safety Net screen.
    final sn = safetyNet.compute(
      input.txns,
      input.goals,
      input.insurances,
      input.investments,
      now: now,
    );
    double? component(String key) {
      final c = sn.components.where((c) => c.key == key).firstOrNull;
      return c == null ? null : _clamp01(c.coveredPct / 100);
    }

    final hasInsurance = input.insurances.isNotEmpty;
    // An emergency fund is only visible to the app as an emergency-fund goal.
    // Having spending history is not enough: it gives a *target* to measure
    // against, but no reading of what the user has actually set aside. Scoring
    // that as 0% covered would assert they have no buffer, when the truth is
    // that they have not told us about one.
    final hasEmergencyBasis =
        input.goals.any((g) => g.goalType == GoalType.emergencyFund);

    // ---- Wealth: what you own and how it is shaped ----
    final trajectory = _trajectory(input.snapshots, annualIncome, cash + invested);
    final investedShare = assets <= 0 ? null : _clamp01((invested / assets) / 0.4);
    final conc = input.investments.concentration;
    final wealth = HealthCategory(
      key: 'wealth',
      label: 'Wealth',
      weight: wealthWeight,
      detail: hasLedger || hasPortfolio
          ? 'What you own, and how concentrated it is.'
          : 'Add a transaction or a holding to start tracking this.',
      metrics: [
        HealthMetric(
          key: 'wealth.trajectory',
          label: 'Net-worth trajectory',
          weight: 12,
          value: trajectory?.value,
          detail: trajectory?.detail ?? 'Needs a few weeks of history.',
        ),
        HealthMetric(
          key: 'wealth.invested_share',
          label: 'Invested share',
          weight: 10,
          value: investedShare,
          detail: investedShare == null
              ? 'No assets tracked yet.'
              : '${(invested / assets * 100).round()}% of assets invested '
                  '(target 40%).',
        ),
        HealthMetric(
          key: 'wealth.concentration',
          label: 'Diversification',
          weight: 8,
          // Full marks at or below 60% in one group, tapering to zero at 100%.
          value: conc == null ? null : _clamp01((1 - conc) / 0.4),
          detail: conc == null
              ? 'No holdings tracked yet.'
              : '${(conc * 100).round()}% sits in your largest asset group.',
        ),
      ],
    );

    // ---- Protection: what happens if something goes wrong ----
    final protection = HealthCategory(
      key: 'protection',
      label: 'Protection',
      weight: protectionWeight,
      detail: hasInsurance || hasEmergencyBasis
          ? 'Your cover against the unexpected.'
          : 'Add a policy or an emergency-fund goal to track this.',
      metrics: [
        HealthMetric(
          key: 'protection.emergency',
          label: 'Emergency fund',
          weight: 10,
          value: hasEmergencyBasis ? component('emergency') : null,
          detail: hasEmergencyBasis
              ? '${sn.monthsCovered.toStringAsFixed(1)} months of expenses covered.'
              : 'No emergency-fund goal and no spending history yet.',
        ),
        HealthMetric(
          key: 'protection.life',
          label: 'Life cover',
          weight: 8,
          // Without a policy on file the app knows nothing — it does not know
          // the user is uninsured, only that it has not been told.
          value: hasInsurance ? component('life') : null,
          detail: hasInsurance
              ? 'Against the 10× annual-income guideline.'
              : 'No policies added yet.',
        ),
        HealthMetric(
          key: 'protection.health',
          label: 'Health cover',
          weight: 7,
          value: hasInsurance ? component('health') : null,
          detail: hasInsurance
              ? 'Against the ₹5L / half-income guideline.'
              : 'No policies added yet.',
        ),
      ],
    );

    // ---- Efficiency: how well the month runs ----
    final savingsRate = income90 == 0 ? null : s90.net.toDouble() / income90;
    final hasDebtBasis = input.liabilities.isNotEmpty || assets > 0;
    final dti = !hasDebtBasis
        ? null
        : (assets <= 0 ? (debt > 0 ? 1.0 : 0.0) : _clamp01(debt / assets));
    // High-APR debt is worse than its size suggests: a small balance at 42%
    // compounds faster than a large one at 8%, so it costs a little extra here.
    final highApr = input.liabilities.any((l) => l.aprPct > Decimal.fromInt(24));
    final debtScore =
        dti == null ? null : _clamp01((1 - dti) * (highApr ? 0.85 : 1.0));
    final budgetAdherence = _budgetAdherence(input.budgets, input.txns, now);
    final efficiency = HealthCategory(
      key: 'efficiency',
      label: 'Efficiency',
      weight: efficiencyWeight,
      detail: hasLedger
          ? 'How much of what comes in stays in.'
          : 'Add some transactions to track this.',
      metrics: [
        HealthMetric(
          key: 'efficiency.savings_rate',
          label: 'Savings rate',
          weight: 10,
          value: savingsRate == null ? null : _clamp01(savingsRate / 0.3),
          detail: savingsRate == null
              ? 'No income recorded in the last 90 days.'
              : '${(savingsRate * 100).round()}% of income saved (90 days).',
        ),
        HealthMetric(
          key: 'efficiency.debt_load',
          label: 'Debt load',
          weight: 10,
          value: debtScore,
          detail: dti == null
              ? 'No assets or liabilities tracked yet.'
              : '${(dti * 100).round()}% debt-to-asset ratio'
                  '${highApr ? ', including high-interest debt.' : '.'}',
        ),
        HealthMetric(
          key: 'efficiency.budget_adherence',
          label: 'Budget adherence',
          weight: 5,
          value: budgetAdherence?.value,
          detail: budgetAdherence?.detail ?? 'No budgets set yet.',
        ),
      ],
    );

    // ---- Future: what you are building toward ----
    final growth = input.investments.growthValue.toDouble();
    final growthShare = invested <= 0 ? null : _clamp01(growth / invested);
    final goalPace = _goalPace(input.goals, now);
    final future = HealthCategory(
      key: 'future',
      label: 'Future',
      weight: futureWeight,
      detail: hasPortfolio || input.goals.isNotEmpty
          ? 'What you are building toward.'
          : 'Add a goal or a holding to track this.',
      metrics: [
        HealthMetric(
          key: 'future.retirement_assets',
          label: 'Retirement assets',
          weight: 8,
          // Needs both sides of the ratio. Income alone is not enough: a user
          // who has recorded no holdings at all has not told us they hold no
          // FD or PPF, so scoring them 0% covered would be an assertion the
          // app cannot make. Once there *is* a portfolio, its composition is
          // known, and an absence of retirement assets is a real reading.
          value: (hasPortfolio && annualIncome > 0)
              ? component('retirement')
              : null,
          detail: (hasPortfolio && annualIncome > 0)
              ? 'FD / PPF·EPF / NPS against a year of income.'
              : 'Needs both a portfolio and recorded income.',
        ),
        HealthMetric(
          key: 'future.goal_pace',
          label: 'Goal pace',
          weight: 7,
          value: goalPace?.value,
          detail: goalPace?.detail ?? 'No goals set yet.',
        ),
        HealthMetric(
          key: 'future.growth_allocation',
          label: 'Growth allocation',
          weight: 5,
          value: growthShare,
          detail: growthShare == null
              ? 'No holdings tracked yet.'
              : '${(growthShare * 100).round()}% of your portfolio is in '
                  'growth assets.',
        ),
      ],
    );

    final categories = [wealth, protection, efficiency, future];
    final tracked = categories.where((c) => c.isTracked).toList();
    final trackedWeight = tracked.fold(0.0, (s, c) => s + c.weight);

    int? total;
    if (trackedWeight > 0) {
      final earned = tracked.fold(0.0, (s, c) => s + c.score!);
      total = (earned / trackedWeight * 100).round();
    }
    final grade =
        (total != null && trackedWeight >= minGradableWeight) ? gradeOf(total) : null;

    return HealthScore(
      score: total,
      grade: grade,
      trackedWeight: trackedWeight,
      categories: categories,
      summary: _summary(total, grade, categories, trackedWeight),
    );
  }

  static String _summary(
    int? total,
    String? grade,
    List<HealthCategory> categories,
    double trackedWeight,
  ) {
    if (total == null) {
      return 'Add a transaction, a holding or a policy and your score will '
          'appear here.';
    }
    final untracked = categories.where((c) => !c.isTracked).toList();
    if (grade == null) {
      return 'Based on ${categories.length - untracked.length} of '
          '${categories.length} areas so far — add more and this gets sharper.';
    }
    if (untracked.isNotEmpty) {
      final names = untracked.map((c) => c.label.toLowerCase()).join(' and ');
      return "You're in ${grade.toLowerCase()} shape across "
          '${categories.length - untracked.length} of ${categories.length} '
          'areas. $names ${untracked.length == 1 ? 'is' : 'are'} not tracked yet.';
    }
    final weakest = [...categories]
      ..sort((a, b) => (a.fraction ?? 0).compareTo(b.fraction ?? 0));
    return total >= 70
        ? "You're in ${grade.toLowerCase()} shape across all four areas."
        : 'Biggest opportunity: ${weakest.first.label.toLowerCase()}. Small '
            'improvements here lift your score fastest.';
  }

  /// Net-worth direction over the available history.
  ///
  /// Prefers real snapshots. With fewer than two it falls back to net worth as a
  /// multiple of annual income, which measures something adjacent rather than
  /// pretending to know a trend from one point.
  static ({double value, String detail})? _trajectory(
    List<NetWorthSnapshot> snapshots,
    double annualIncome,
    double netWorth,
  ) {
    if (snapshots.length >= 2) {
      final sorted = [...snapshots]..sort((a, b) => a.date.compareTo(b.date));
      final first = sorted.first.netWorth.toDouble();
      final last = sorted.last.netWorth.toDouble();
      final delta = last - first;
      if (first.abs() < 1e-9) {
        return (
          value: delta > 0 ? 1.0 : 0.0,
          detail: delta > 0 ? 'Net worth is growing.' : 'Net worth is flat.',
        );
      }
      final growth = delta / first.abs();
      // Full marks at +10% over the tracked window; flat scores a third,
      // because holding steady is not failure.
      final v = _clamp01(0.33 + growth / 0.10 * 0.67);
      return (
        value: v,
        detail: delta >= 0
            ? 'Net worth is up ${(growth * 100).abs().toStringAsFixed(1)}% over '
                'your tracked history.'
            : 'Net worth is down ${(growth * 100).abs().toStringAsFixed(1)}% '
                'over your tracked history.',
      );
    }
    if (annualIncome <= 0) return null;
    final multiple = netWorth / annualIncome;
    return (
      value: _clamp01(multiple / 3),
      detail: '${multiple.toStringAsFixed(1)}× your annual income saved so far.',
    );
  }

  /// Share of budgeted categories still inside their limit this month.
  static ({double value, String detail})? _budgetAdherence(
    List<Budget> budgets,
    List<Txn> txns,
    DateTime now,
  ) {
    if (budgets.isEmpty) return null;
    const calc = BudgetCalculator();
    final (first, last) = calc.monthRange(now);
    var within = 0;
    for (final b in budgets) {
      final spent = calc.spent(txns, b.categoryId, first, last);
      // `BudgetProgress.fraction` is capped at 1 for the progress bar, so
      // compare the raw amounts — otherwise every overspent budget reads as
      // exactly at limit.
      if (spent <= b.amountLimit) within++;
    }
    return (
      value: within / budgets.length,
      detail: '$within of ${budgets.length} budgets still within limit '
          'this month.',
    );
  }

  /// How well funded are the goals?
  ///
  /// Emergency-fund goals are excluded — they are Protection's business, and
  /// counting them twice would let one goal move two categories.
  ///
  /// This measures funding, not pace against a schedule: [Goal] records a target
  /// date but not a start date, so there is no baseline to straight-line from.
  /// The one schedule fact available is whether the date has passed, and an
  /// overdue unfunded goal is judged on that.
  static ({double value, String detail})? _goalPace(
    List<Goal> goals,
    DateTime now,
  ) {
    // A fully funded goal is done, not 'at 100% pace' — leaving it in would let
    // finished goals prop the category up forever. `currentAmount >= target` is
    // also the only definition the web model can express (it has no isAchieved
    // column), so both sides use it.
    final relevant = goals
        .where((g) =>
            g.goalType != GoalType.emergencyFund &&
            !g.isAchieved &&
            g.currentAmount < g.targetAmount)
        .toList();
    if (relevant.isEmpty) return null;

    var scored = 0.0;
    var healthy = 0;
    var overdue = 0;
    for (final g in relevant) {
      final target = g.targetAmount.toDouble();
      final funded =
          target <= 0 ? 1.0 : _clamp01(g.currentAmount.toDouble() / target);
      final due = g.targetDate;
      final isOverdue = due != null && due.isBefore(now);
      // Past its date and still short: the shortfall is now certain rather than
      // merely possible, so it counts for half of what it otherwise would.
      final v = isOverdue ? funded * 0.5 : funded;
      scored += v;
      if (isOverdue) overdue++;
      if (v >= 0.75) healthy++;
    }
    return (
      value: scored / relevant.length,
      detail: overdue > 0
          ? '$healthy of ${relevant.length} goals well funded, $overdue past '
              'its target date.'
          : '$healthy of ${relevant.length} goals well funded.',
    );
  }
}

/// Everything the score reads.
///
/// A parameter object rather than eight positional arguments: this signature is
/// mirrored in TypeScript, and a long positional list is exactly where two ported
/// implementations silently swap two arguments and drift.
class HealthInputs {
  const HealthInputs({
    required this.txns,
    required this.investments,
    required this.liabilities,
    this.goals = const [],
    this.insurances = const [],
    this.budgets = const [],
    this.snapshots = const [],
    this.now,
  });

  final List<Txn> txns;
  final InvestmentTotals investments;
  final List<Liability> liabilities;
  final List<Goal> goals;
  final List<Insurance> insurances;
  final List<Budget> budgets;
  final List<NetWorthSnapshot> snapshots;
  final DateTime? now;
}

extension _FirstOrNull<E> on Iterable<E> {
  E? get firstOrNull {
    final it = iterator;
    return it.moveNext() ? it.current : null;
  }
}
