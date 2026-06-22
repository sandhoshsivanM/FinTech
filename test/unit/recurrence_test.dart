import 'package:decimal/decimal.dart';
import 'package:fintech_os/domain/entities/recurring_rule.dart';
import 'package:fintech_os/domain/entities/transaction.dart';
import 'package:fintech_os/domain/services/recurrence_calculator.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const calc = RecurrenceCalculator();

  RecurringRule rule(Frequency freq, DateTime nextRun) => RecurringRule(
        id: 'r',
        vaultId: 'v',
        amount: Decimal.parse('1000'),
        type: TxnType.expense,
        categoryId: 'c',
        frequency: freq,
        nextRun: nextRun,
      );

  group('next()', () {
    test('daily/weekly/monthly/yearly', () {
      final base = DateTime(2026, 1, 15);
      expect(calc.next(base, Frequency.daily), DateTime(2026, 1, 16));
      expect(calc.next(base, Frequency.weekly), DateTime(2026, 1, 22));
      expect(calc.next(base, Frequency.monthly), DateTime(2026, 2, 15));
      expect(calc.next(base, Frequency.yearly), DateTime(2027, 1, 15));
    });
  });

  group('materialize() catch-up', () {
    test('no occurrences when nextRun is in the future', () {
      final r = rule(Frequency.monthly, DateTime(2026, 12, 1));
      final res = calc.materialize(r, DateTime(2026, 6, 1));
      expect(res.due, isEmpty);
      expect(res.newNextRun, DateTime(2026, 12, 1));
    });

    test('catches up missed monthly runs', () {
      // nextRun Jan 1, now Apr 15 → Jan, Feb, Mar, Apr = 4 occurrences.
      final r = rule(Frequency.monthly, DateTime(2026, 1, 1));
      final res = calc.materialize(r, DateTime(2026, 4, 15));
      expect(res.due.length, 4);
      expect(res.newNextRun, DateTime(2026, 5, 1));
    });

    test('single due occurrence advances by one period', () {
      final r = rule(Frequency.weekly, DateTime(2026, 6, 1));
      final res = calc.materialize(r, DateTime(2026, 6, 3));
      expect(res.due.length, 1);
      expect(res.newNextRun, DateTime(2026, 6, 8));
    });
  });
}
