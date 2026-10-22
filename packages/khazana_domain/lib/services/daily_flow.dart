import 'package:decimal/decimal.dart';

import '../entities/transaction.dart';

/// Money in and out on one local calendar day.
class DayFlow {
  DayFlow(this.day) : income = Decimal.zero, expense = Decimal.zero;

  /// Local midnight.
  final DateTime day;
  Decimal income;
  Decimal expense;

  Decimal get net => income - expense;
}

/// The last [days] local days, oldest first, ending with the day of [now].
///
/// The twin of `packages/domain-ts/src/dailyFlow.ts`. Days are built with calendar
/// arithmetic (`DateTime(y, m, d - i)`), not by subtracting 24 hours, so a DST
/// change can never merge or skip a day.
List<DayFlow> dailyFlow(List<Txn> txns, DateTime now, {int days = 7}) {
  final out = [
    for (var i = days - 1; i >= 0; i--)
      DayFlow(DateTime(now.year, now.month, now.day - i)),
  ];
  final byDay = {for (final d in out) d.day: d};
  for (final t in txns) {
    final row = byDay[DateTime(t.date.year, t.date.month, t.date.day)];
    if (row == null) continue;
    if (t.type == TxnType.income) {
      row.income += t.amount;
    } else {
      row.expense += t.amount;
    }
  }
  return out;
}

/// A change between two amounts, worded the way a person reads it: a
/// percentage up to double, a multiple beyond that ("52×" rather than
/// "5145%"). Null when there is nothing to compare against. The twin of
/// `describeChange` in `packages/domain-ts/src/dailyFlow.ts`.
({bool up, String text})? describeChange(Decimal now, Decimal before) {
  if (before == Decimal.zero) return null;
  final ratio = now.toDouble() / before.toDouble();
  final up = ratio > 1;
  if (ratio >= 2) {
    return (
      up: up,
      text: '${ratio >= 10 ? ratio.toStringAsFixed(0) : ratio.toStringAsFixed(1)}×',
    );
  }
  return (up: up, text: '${((ratio - 1) * 100).abs().toStringAsFixed(0)}%');
}
