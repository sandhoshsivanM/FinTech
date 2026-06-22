import 'package:decimal/decimal.dart';

import '../entities/goal.dart';

class GoalProgress {
  const GoalProgress({
    required this.goal,
    required this.fraction,
    required this.projectedCompletion,
    required this.onTrack,
    required this.monthsBehind,
  });

  final Goal goal;
  final double fraction; // 0..1
  final DateTime? projectedCompletion;
  final bool onTrack;
  final int monthsBehind; // 0 when on track / unknown

  bool get isAchieved => goal.currentAmount >= goal.targetAmount;
}

/// Pure-Dart goal projection (PRD §8C): projected completion from average
/// contribution rate; on-track (green) vs behind (amber, "X months behind").
class GoalProjector {
  const GoalProjector();

  GoalProgress evaluate(
    Goal goal,
    List<GoalContribution> contributions, {
    DateTime? now,
  }) {
    final today = now ?? DateTime.now();
    final fraction = goal.targetAmount == Decimal.zero
        ? 1.0
        : (goal.currentAmount / goal.targetAmount)
            .toDouble()
            .clamp(0.0, 1.0);

    final remaining = goal.targetAmount - goal.currentAmount;
    DateTime? projected;
    var onTrack = true;
    var monthsBehind = 0;

    if (remaining > Decimal.zero && contributions.isNotEmpty) {
      final sorted = [...contributions]
        ..sort((a, b) => a.contributedAt.compareTo(b.contributedAt));
      final first = sorted.first.contributedAt;
      final elapsedDays = today.difference(first).inDays;
      final elapsedMonths = (elapsedDays / 30.0).clamp(1.0, double.infinity);
      final total = contributions.fold(
          Decimal.zero, (s, c) => s + c.amount);
      final avgPerMonth = total.toDouble() / elapsedMonths;
      if (avgPerMonth > 0) {
        final monthsToGo = (remaining.toDouble() / avgPerMonth).ceil();
        projected = DateTime(today.year, today.month + monthsToGo, today.day);
        if (goal.targetDate != null && projected.isAfter(goal.targetDate!)) {
          onTrack = false;
          monthsBehind = _monthsBetween(goal.targetDate!, projected);
        }
      } else {
        onTrack = goal.targetDate == null;
      }
    }

    return GoalProgress(
      goal: goal,
      fraction: fraction,
      projectedCompletion: projected,
      onTrack: onTrack,
      monthsBehind: monthsBehind,
    );
  }

  static int _monthsBetween(DateTime from, DateTime to) {
    final m = (to.year - from.year) * 12 + (to.month - from.month);
    return m < 0 ? 0 : m;
  }
}
