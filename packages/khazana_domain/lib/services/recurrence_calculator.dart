import '../entities/recurring_rule.dart';

/// One materialized occurrence of a recurring rule.
class DueOccurrence {
  const DueOccurrence(this.date);
  final DateTime date;
}

/// Pure-Dart recurrence math (PRD §14 recurring transactions).
class RecurrenceCalculator {
  const RecurrenceCalculator();

  /// The next run date after [from] for [frequency].
  DateTime next(DateTime from, Frequency frequency) {
    switch (frequency) {
      case Frequency.daily:
        return from.add(const Duration(days: 1));
      case Frequency.weekly:
        return from.add(const Duration(days: 7));
      case Frequency.monthly:
        return DateTime(from.year, from.month + 1, from.day);
      case Frequency.yearly:
        return DateTime(from.year + 1, from.month, from.day);
    }
  }

  /// All occurrences due up to and including [now], catching up missed runs.
  /// Returns the occurrences plus the rule's new nextRun. Capped to avoid
  /// runaway loops on very stale rules.
  ({List<DueOccurrence> due, DateTime newNextRun}) materialize(
    RecurringRule rule,
    DateTime now, {
    int maxCatchUp = 1000,
  }) {
    final due = <DueOccurrence>[];
    var run = rule.nextRun;
    var guard = 0;
    while (!run.isAfter(now) && guard < maxCatchUp) {
      due.add(DueOccurrence(run));
      run = next(run, rule.frequency);
      guard++;
    }
    return (due: due, newNextRun: run);
  }
}
