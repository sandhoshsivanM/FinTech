import 'package:decimal/decimal.dart';
import 'package:khazana/domain/entities/liability.dart';
import 'package:khazana/domain/services/debt_calculator.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const calc = DebtCalculator();

  Liability debt(String name, String principal, String apr,
          {LiabilityKind kind = LiabilityKind.creditCard, int? term}) =>
      Liability(
        id: name,
        vaultId: 'v',
        name: name,
        kind: kind,
        principal: Decimal.parse(principal),
        aprPct: Decimal.parse(apr),
        termMonths: term,
      );

  group('EMI', () {
    test('matches the standard amortization formula (~₹8,791 for 1L@10%/12m)',
        () {
      final emi = calc.emi(Decimal.parse('100000'), Decimal.parse('10'), 12);
      // Closed-form ≈ 8791.59
      expect(emi.toDouble(), closeTo(8791.59, 0.5));
    });

    test('zero interest splits principal evenly', () {
      final emi = calc.emi(Decimal.parse('1200'), Decimal.zero, 12);
      expect(emi, Decimal.parse('100.00'));
    });
  });

  group('monthly interest', () {
    test('1% monthly on 10,000 = 100', () {
      expect(calc.monthlyInterest(Decimal.parse('10000'), Decimal.parse('12')),
          Decimal.parse('100.00'));
    });
  });

  group('payoff simulation', () {
    test('avalanche pays less total interest than snowball', () {
      // Big low-rate balance vs small high-rate balance.
      final debts = [
        debt('BigLowApr', '100000', '10'),
        debt('SmallHighApr', '20000', '36'),
      ];
      final budget = Decimal.parse('15000');
      final avalanche =
          calc.simulate(debts, budget, PayoffStrategy.avalanche);
      final snowball = calc.simulate(debts, budget, PayoffStrategy.snowball);
      expect(avalanche.feasible, isTrue);
      expect(snowball.feasible, isTrue);
      expect(avalanche.totalInterest <= snowball.totalInterest, isTrue);
    });

    test('infeasible when budget cannot cover interest', () {
      final debts = [debt('Card', '100000', '36')];
      // 3% monthly ≈ 3000 interest; budget below that never clears.
      final r = calc.simulate(debts, Decimal.parse('1000'), PayoffStrategy.avalanche);
      expect(r.feasible, isFalse);
    });

    test('single debt is paid off and reports months', () {
      final debts = [debt('Card', '10000', '12')];
      final r = calc.simulate(debts, Decimal.parse('2000'), PayoffStrategy.avalanche);
      expect(r.feasible, isTrue);
      expect(r.monthsToDebtFree, greaterThan(0));
      expect(r.monthsToDebtFree, lessThan(12));
    });
  });
}
