import 'dart:math' as math;

import 'package:decimal/decimal.dart';

import '../entities/liability.dart';

/// Debt repayment strategy (PRD §14 payoff simulator).
enum PayoffStrategy {
  avalanche, // highest APR first (minimises interest)
  snowball, // smallest balance first (motivational)
}

class PayoffResult {
  const PayoffResult({
    required this.monthsToDebtFree,
    required this.totalInterest,
    required this.feasible,
  });

  final int monthsToDebtFree;
  final Decimal totalInterest;

  /// False when the monthly budget can't even cover accruing interest.
  final bool feasible;
}

/// Pure-Dart debt math (PRD §14: EMI breakdown + Avalanche/Snowball simulator).
class DebtCalculator {
  const DebtCalculator();

  /// Equated Monthly Installment for a loan. Amortization is inherently
  /// irrational, so it's computed in double then rounded to 2-dp Decimal.
  Decimal emi(Decimal principal, Decimal aprPct, int months) {
    if (months <= 0) return Decimal.zero;
    final p = principal.toDouble();
    final r = aprPct.toDouble() / 1200.0;
    if (r == 0) {
      return Decimal.parse((p / months).toStringAsFixed(2));
    }
    final pow = math.pow(1 + r, months);
    final emi = p * r * pow / (pow - 1);
    return Decimal.parse(emi.toStringAsFixed(2));
  }

  Decimal monthlyInterest(Decimal balance, Decimal aprPct) {
    final i = balance.toDouble() * aprPct.toDouble() / 1200.0;
    return Decimal.parse(i.toStringAsFixed(2));
  }

  /// Simulates paying down [liabilities] with a fixed [monthlyBudget] using
  /// [strategy]. Returns months-to-debt-free and total interest paid.
  PayoffResult simulate(
    List<Liability> liabilities,
    Decimal monthlyBudget,
    PayoffStrategy strategy, {
    int maxMonths = 1200,
  }) {
    var balances = {for (final l in liabilities) l.id: l.principal};
    final apr = {for (final l in liabilities) l.id: l.aprPct};
    var totalInterest = Decimal.zero;
    var months = 0;

    while (balances.values.any((b) => b > Decimal.zero)) {
      if (months >= maxMonths) {
        return PayoffResult(
            monthsToDebtFree: months,
            totalInterest: totalInterest,
            feasible: false);
      }
      // Accrue interest.
      var interestThisMonth = Decimal.zero;
      for (final id in balances.keys) {
        if (balances[id]! <= Decimal.zero) continue;
        final i = monthlyInterest(balances[id]!, apr[id]!);
        balances[id] = balances[id]! + i;
        interestThisMonth += i;
      }
      totalInterest += interestThisMonth;

      // Infeasible if budget can't cover this month's interest.
      if (monthlyBudget <= interestThisMonth &&
          balances.values.any((b) => b > Decimal.zero)) {
        return PayoffResult(
            monthsToDebtFree: months,
            totalInterest: totalInterest,
            feasible: false);
      }

      // Order by strategy and apply the whole budget greedily.
      final order = balances.keys
          .where((id) => balances[id]! > Decimal.zero)
          .toList()
        ..sort((a, b) => strategy == PayoffStrategy.avalanche
            ? apr[b]!.compareTo(apr[a]!)
            : balances[a]!.compareTo(balances[b]!));

      var remaining = monthlyBudget;
      for (final id in order) {
        if (remaining <= Decimal.zero) break;
        final pay = remaining < balances[id]! ? remaining : balances[id]!;
        balances[id] = balances[id]! - pay;
        remaining -= pay;
      }
      months++;
    }
    return PayoffResult(
        monthsToDebtFree: months,
        totalInterest: totalInterest,
        feasible: true);
  }
}
