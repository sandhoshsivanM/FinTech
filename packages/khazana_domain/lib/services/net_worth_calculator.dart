import 'package:decimal/decimal.dart';

import '../entities/transaction.dart';

/// Dashboard time windows (PRD §14: 7D/1M/3M/6M/1Y/custom — MVP exposes 7D/1M/3M).
enum TimeWindow {
  sevenDays(Duration(days: 7), '7D'),
  oneMonth(Duration(days: 30), '1M'),
  threeMonths(Duration(days: 90), '3M');

  const TimeWindow(this.duration, this.label);
  final Duration duration;
  final String label;
}

/// A point on the net-worth trend line.
class NetWorthPoint {
  const NetWorthPoint(this.date, this.value);
  final DateTime date;
  final Decimal value;
}

/// Income vs. expense totals over a window.
class WindowSummary {
  const WindowSummary({required this.income, required this.expense});
  final Decimal income;
  final Decimal expense;
  Decimal get net => income - expense;
}

/// Pure-Dart net worth math (PRD §3 domain/services — no Flutter imports).
/// Net worth from cash flow: cumulative sum of signed amounts (PRD §16:
/// adding expense X reduces net worth by exactly X, no rounding).
class NetWorthCalculator {
  const NetWorthCalculator();

  /// Total net worth across all transactions (income − expense).
  Decimal total(List<Txn> all) =>
      all.fold(Decimal.zero, (sum, t) => sum + t.signedAmount);

  DateTime windowStart(TimeWindow window, DateTime now) =>
      now.subtract(window.duration);

  /// Income/expense totals strictly within [windowStart, now].
  WindowSummary summary(List<Txn> all, TimeWindow window, {DateTime? now}) {
    final end = now ?? DateTime.now();
    final start = windowStart(window, end);
    var income = Decimal.zero;
    var expense = Decimal.zero;
    for (final t in all) {
      if (t.date.isBefore(start) || t.date.isAfter(end)) continue;
      if (t.type == TxnType.income) {
        income += t.amount;
      } else {
        expense += t.amount;
      }
    }
    return WindowSummary(income: income, expense: expense);
  }

  /// Daily cumulative net-worth series across the window. The first point is
  /// the opening net worth (all transactions before the window start); each
  /// subsequent day folds in that day's net delta.
  List<NetWorthPoint> series(List<Txn> all, TimeWindow window,
      {DateTime? now}) {
    final end = _dayStart(now ?? DateTime.now());
    final start = _dayStart(end.subtract(window.duration));

    // Opening balance: everything strictly before the window start day.
    var running = all
        .where((t) => t.date.isBefore(start))
        .fold(Decimal.zero, (s, t) => s + t.signedAmount);

    // Bucket signed deltas by day within the window.
    final deltas = <DateTime, Decimal>{};
    for (final t in all) {
      final day = _dayStart(t.date);
      if (day.isBefore(start) || day.isAfter(end)) continue;
      deltas[day] = (deltas[day] ?? Decimal.zero) + t.signedAmount;
    }

    final points = <NetWorthPoint>[];
    for (var day = start;
        !day.isAfter(end);
        day = day.add(const Duration(days: 1))) {
      running += deltas[day] ?? Decimal.zero;
      points.add(NetWorthPoint(day, running));
    }
    return points;
  }

  static DateTime _dayStart(DateTime d) => DateTime(d.year, d.month, d.day);
}
