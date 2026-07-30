import 'package:decimal/decimal.dart';
import 'package:khazana/domain/entities/budget.dart';
import 'package:khazana/domain/entities/transaction.dart';
import 'package:khazana/domain/services/budget_calculator.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const calc = BudgetCalculator();

  Budget budget(String limit, {int threshold = 90}) => Budget(
        id: 'b',
        vaultId: 'v',
        categoryId: 'food',
        amountLimit: Decimal.parse(limit),
        alertThresholdPct: threshold,
      );

  Txn expense(String amount, {String cat = 'food', DateTime? date}) => Txn(
        id: amount + (date?.toIso8601String() ?? ''),
        vaultId: 'v',
        amount: Decimal.parse(amount),
        type: TxnType.expense,
        categoryId: cat,
        date: date ?? DateTime(2026, 6, 10),
        createdAt: date ?? DateTime(2026, 6, 10),
      );

  group('spent (computed on read, PRD §7C)', () {
    test('sums only matching category expenses within the month', () {
      final (first, last) = calc.monthRange(DateTime(2026, 6, 15));
      final txns = [
        expense('1000'),
        expense('500', cat: 'travel'), // wrong category
        expense('250', date: DateTime(2026, 5, 31)), // previous month
        Txn(
          id: 'income',
          vaultId: 'v',
          amount: Decimal.parse('9999'),
          type: TxnType.income, // not an expense
          categoryId: 'food',
          date: DateTime(2026, 6, 5),
          createdAt: DateTime(2026, 6, 5),
        ),
      ];
      expect(calc.spent(txns, 'food', first, last), Decimal.parse('1000'));
    });
  });

  group('status color bands (PRD §7C)', () {
    test('green below 70%', () {
      final p = calc.evaluate(budget('1000'), Decimal.parse('600'));
      expect(p.status, BudgetStatus.ok);
    });
    test('amber 70–90%', () {
      final p = calc.evaluate(budget('1000'), Decimal.parse('800'));
      expect(p.status, BudgetStatus.warning);
    });
    test('red above 90%', () {
      final p = calc.evaluate(budget('1000'), Decimal.parse('950'));
      expect(p.status, BudgetStatus.over);
    });
    test('fraction caps at 1.0 when overspent', () {
      final p = calc.evaluate(budget('1000'), Decimal.parse('1500'));
      expect(p.fraction, 1.0);
      expect(p.isOverspent, isTrue);
      expect(p.remaining, Decimal.parse('-500'));
    });
  });

  group('alert threshold', () {
    test('fires at configured threshold (80%)', () {
      final b = budget('1000', threshold: 80);
      expect(calc.isAtAlertThreshold(b, Decimal.parse('799')), isFalse);
      expect(calc.isAtAlertThreshold(b, Decimal.parse('800')), isTrue);
    });
  });

  group('50/30/20 split (PRD §7A)', () {
    test('splits income correctly', () {
      final s = calc.fiftyThirtyTwenty(Decimal.parse('100000'));
      expect(s.needs, Decimal.parse('50000'));
      expect(s.wants, Decimal.parse('30000'));
      expect(s.savings, Decimal.parse('20000'));
    });
  });
}
