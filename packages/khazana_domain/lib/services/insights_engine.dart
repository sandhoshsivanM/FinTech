import 'package:decimal/decimal.dart';

import '../entities/goal.dart';
import '../entities/recurring_rule.dart';
import '../entities/transaction.dart';
import 'recurrence_calculator.dart';

/// A category whose spending this month is well above its recent average.
class SpendingAnomaly {
  const SpendingAnomaly(this.categoryId, this.current, this.avg, this.ratio);
  final String categoryId;
  final Decimal current;
  final Decimal avg;
  final double ratio;
}

/// Discretionary cash left this month and a per-day safe-to-spend figure.
class SafeToSpend {
  const SafeToSpend(this.remaining, this.perDay, this.daysLeft);
  final Decimal remaining;
  final Decimal perDay;
  final int daysLeft;
}

/// Smarter local insights (no network). Mirrors the web app's insights logic.
class InsightsEngine {
  const InsightsEngine({this.recurrence = const RecurrenceCalculator()});
  final RecurrenceCalculator recurrence;

  static (DateTime, DateTime) _monthBounds(int offset, DateTime now) {
    final first = DateTime(now.year, now.month - offset, 1);
    final last = DateTime(now.year, now.month - offset + 1, 1)
        .subtract(const Duration(milliseconds: 1));
    return (first, last);
  }

  /// Categories spending ≥1.5× their trailing 3-month average (and >₹500 over).
  List<SpendingAnomaly> spendingAnomalies(List<Txn> txns, {DateTime? now}) {
    final n = now ?? DateTime.now();
    final (cf, cl) = _monthBounds(0, n);
    final cur = <String, Decimal>{};
    for (final t in txns) {
      if (t.type != TxnType.expense) continue;
      if (t.date.isBefore(cf) || t.date.isAfter(cl)) continue;
      cur[t.categoryId] = (cur[t.categoryId] ?? Decimal.zero) + t.amount;
    }
    final hist = <String, Decimal>{};
    for (var m = 1; m <= 3; m++) {
      final (f, l) = _monthBounds(m, n);
      for (final t in txns) {
        if (t.type != TxnType.expense) continue;
        if (t.date.isBefore(f) || t.date.isAfter(l)) continue;
        hist[t.categoryId] = (hist[t.categoryId] ?? Decimal.zero) + t.amount;
      }
    }
    final out = <SpendingAnomaly>[];
    cur.forEach((cat, current) {
      final avg = (hist[cat] ?? Decimal.zero) / Decimal.fromInt(3);
      final avgD = avg.toDouble();
      if (avgD <= 0) return;
      final ratio = current.toDouble() / avgD;
      if (ratio >= 1.5 && (current.toDouble() - avgD) > 500) {
        out.add(SpendingAnomaly(
            cat, current, avg.toDecimal(scaleOnInfinitePrecision: 2), ratio));
      }
    });
    out.sort((a, b) => b.ratio.compareTo(a.ratio));
    return out;
  }

  /// Income − spend − upcoming recurring expenses, spread over days remaining.
  SafeToSpend safeToSpend(
    List<Txn> txns,
    List<RecurringRule> recurring, {
    DateTime? now,
  }) {
    final n = now ?? DateTime.now();
    final (cf, cl) = _monthBounds(0, n);
    var income = Decimal.zero;
    var expense = Decimal.zero;
    for (final t in txns) {
      if (t.date.isBefore(cf) || t.date.isAfter(cl)) continue;
      if (t.type == TxnType.income) {
        income += t.amount;
      } else {
        expense += t.amount;
      }
    }
    var upcoming = Decimal.zero;
    for (final r in recurring) {
      if (r.type != TxnType.expense) continue;
      var run = r.nextRun;
      var guard = 0;
      while (!run.isAfter(cl) && guard < 60) {
        if (!run.isBefore(n)) upcoming += r.amount;
        run = recurrence.next(run, r.frequency);
        guard++;
      }
    }
    var remaining = income - expense - upcoming;
    if (remaining < Decimal.zero) remaining = Decimal.zero;
    final daysLeft = (cl.difference(n).inHours / 24).ceil().clamp(1, 60).toInt();
    final perDay = (remaining / Decimal.fromInt(daysLeft))
        .toDecimal(scaleOnInfinitePrecision: 2);
    return SafeToSpend(remaining, perDay, daysLeft);
  }

  /// Monthly contribution needed to hit a goal by its target date (null if no date).
  Decimal? requiredMonthlySip(Goal goal, {DateTime? now}) {
    final date = goal.targetDate;
    if (date == null) return null;
    final remaining = goal.targetAmount - goal.currentAmount;
    if (remaining <= Decimal.zero) return Decimal.zero;
    final n = now ?? DateTime.now();
    final months = (date.difference(n).inDays / 30.44).round();
    final m = months < 1 ? 1 : months;
    return (remaining / Decimal.fromInt(m))
        .toDecimal(scaleOnInfinitePrecision: 2);
  }
}
