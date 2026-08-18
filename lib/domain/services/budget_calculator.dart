import 'package:decimal/decimal.dart';

import '../entities/budget.dart';
import '../entities/transaction.dart';

/// Color band for a budget's progress (PRD §7C): green <70%, amber 70–90%,
/// red >90%.
enum BudgetStatus { ok, warning, over }

/// Evaluated budget state for the UI.
class BudgetProgress {
  const BudgetProgress({
    required this.budget,
    required this.spent,
    required this.remaining,
    required this.fraction,
    required this.status,
  });

  final Budget budget;
  final Decimal spent;
  final Decimal remaining; // can be negative (overspent)
  final double fraction; // 0..1, capped for the progress bar
  final BudgetStatus status;

  bool get isOverspent => remaining < Decimal.zero;
}

/// Pure-Dart budget math (PRD §7C). Spent is always computed from transactions
/// on demand — never stored (avoids stale data).
class BudgetCalculator {
  const BudgetCalculator();

  /// Inclusive [first, last] day bounds of the month containing [date].
  (DateTime, DateTime) monthRange(DateTime date) {
    final first = DateTime(date.year, date.month, 1);
    final last = DateTime(date.year, date.month + 1, 1)
        .subtract(const Duration(milliseconds: 1));
    return (first, last);
  }

  /// Sum of expense transactions for [categoryId] within [first, last].
  Decimal spent(
    List<Txn> txns,
    String categoryId,
    DateTime first,
    DateTime last,
  ) {
    var total = Decimal.zero;
    for (final t in txns) {
      if (t.type != TxnType.expense) continue;
      if (t.categoryId != categoryId) continue;
      if (t.date.isBefore(first) || t.date.isAfter(last)) continue;
      total += t.amount;
    }
    return total;
  }

  /// Evaluates a budget against an already-computed [spent] amount.
  BudgetProgress evaluate(Budget budget, Decimal spent) {
    final limit = budget.amountLimit;
    final remaining = limit - spent;
    final ratio = limit == Decimal.zero
        ? 0.0
        : (spent / limit).toDouble();
    final fraction = ratio.clamp(0.0, 1.0);
    final pct = ratio * 100;
    final status = pct > 90
        ? BudgetStatus.over
        : (pct >= 70 ? BudgetStatus.warning : BudgetStatus.ok);
    return BudgetProgress(
      budget: budget,
      spent: spent,
      remaining: remaining,
      fraction: fraction,
      status: status,
    );
  }

  /// True if spending has reached the budget's configured alert threshold
  /// (PRD §7A: notify when a category exceeds its threshold, default 90%).
  bool isAtAlertThreshold(Budget budget, Decimal spent) =>
      budget.amountLimit > Decimal.zero &&
      spentPct(budget, spent) >= budget.alertThresholdPct;

  /// Spend as a whole percentage of the limit, floored.
  ///
  /// Whole, and computed in Decimal rather than through `toDouble()`, because
  /// this is what the notification body says out loud and what its dedupe key is
  /// built from. A percentage that renders as 94 here and 94.000001 elsewhere
  /// would give the same alert two identities and let it fire twice.
  int spentPct(Budget budget, Decimal spent) {
    if (budget.amountLimit <= Decimal.zero) return 0;
    return (spent * Decimal.fromInt(100) / budget.amountLimit)
        .toDecimal(scaleOnInfinitePrecision: 6)
        .floor()
        .toBigInt()
        .toInt();
  }

  /// 50/30/20 quick-start split of a monthly [income] (PRD §7A).
  ({Decimal needs, Decimal wants, Decimal savings}) fiftyThirtyTwenty(
      Decimal income) {
    Decimal pctOf(int p) =>
        (income * Decimal.fromInt(p) / Decimal.fromInt(100))
            .toDecimal(scaleOnInfinitePrecision: 2);
    return (needs: pctOf(50), wants: pctOf(30), savings: pctOf(20));
  }
}
