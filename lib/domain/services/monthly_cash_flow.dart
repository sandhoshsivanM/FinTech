import 'package:decimal/decimal.dart';

import '../entities/transaction.dart';

/// One calendar month of money in and out.
class MonthlyFlow {
  const MonthlyFlow({
    required this.year,
    required this.month,
    required this.income,
    required this.expense,
  });

  final int year;

  /// 1–12.
  final int month;

  final Decimal income;
  final Decimal expense;

  Decimal get net => income - expense;

  /// Short label for an axis: "Aug", or "Aug '25" when the series spans a year
  /// boundary and the month alone would be ambiguous.
  String label({bool withYear = false}) =>
      withYear ? '$_month ’${year % 100}' : _month;

  String get _month => const [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ][month - 1];
}

/// Rolls a ledger up into calendar months.
///
/// The dashboard and Reports both showed income and expense as two totals for
/// the whole window — a pair of numbers that cannot answer the question people
/// actually bring to them, which is not "how much did I spend" but "is that
/// more than usual". A month-by-month series answers it in one glance and needs
/// no extra data: the ledger already has every date.
abstract final class MonthlyCashFlow {
  /// The last [months] calendar months ending with the month containing [now],
  /// oldest first.
  ///
  /// Months with no transactions are INCLUDED as zero rather than skipped. A
  /// bar chart that quietly omits an empty month draws the remaining bars
  /// evenly spaced and turns a gap in the data into a continuous history — the
  /// one reading it must not support.
  static List<MonthlyFlow> lastMonths(
    List<Txn> txns, {
    required int months,
    DateTime? now,
  }) {
    assert(months > 0);
    final end = now ?? DateTime.now();

    // Keyed by year*12+month so arithmetic across a year boundary is ordinary
    // integer maths rather than a stack of conditionals.
    final endIndex = end.year * 12 + (end.month - 1);
    final startIndex = endIndex - (months - 1);

    final income = <int, Decimal>{};
    final expense = <int, Decimal>{};
    for (final t in txns) {
      final i = t.date.year * 12 + (t.date.month - 1);
      if (i < startIndex || i > endIndex) continue;
      if (t.type == TxnType.income) {
        income[i] = (income[i] ?? Decimal.zero) + t.amount;
      } else {
        expense[i] = (expense[i] ?? Decimal.zero) + t.amount;
      }
    }

    return [
      for (var i = startIndex; i <= endIndex; i++)
        MonthlyFlow(
          year: i ~/ 12,
          month: i % 12 + 1,
          income: income[i] ?? Decimal.zero,
          expense: expense[i] ?? Decimal.zero,
        ),
    ];
  }

  /// Whether the series crosses a year boundary, so labels need the year.
  static bool spansYears(List<MonthlyFlow> flows) =>
      flows.isNotEmpty && flows.first.year != flows.last.year;
}
