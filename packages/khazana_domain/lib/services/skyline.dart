import 'package:decimal/decimal.dart';

import '../entities/net_worth_snapshot.dart';
import '../entities/transaction.dart';

/// The numbers behind the "skyline" charts: one cell per day, laid out as
/// weeks (columns) by weekdays (rows, Sunday first, as the spend calendar).
///
/// The twin of `packages/domain-ts/src/skyline.ts`. The grid always runs whole
/// weeks, Sunday to Saturday, so a range that starts mid-week still lines up;
/// days outside the range, and days after today, carry a null amount and are
/// drawn as empty outlines rather than as zero spending.
///
/// Money stays [Decimal]; [SkyCell.value] is the same figure as a double, for
/// bar height only. Every figure a card prints comes from the Decimal side.
/// Days are built with calendar arithmetic (`DateTime(y, m, d + n)`), never by
/// adding 24 hours, so a DST change can neither merge nor skip a day.

/// An inclusive run of local days.
class SkyRange {
  SkyRange(DateTime start, DateTime end) : start = _day(start), end = _day(end);

  /// Local midnight of the first day.
  final DateTime start;

  /// Local midnight of the last day.
  final DateTime end;

  @override
  bool operator ==(Object other) =>
      other is SkyRange && other.start == start && other.end == end;

  @override
  int get hashCode => Object.hash(start, end);
}

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);
DateTime _addDays(DateTime d, int n) => DateTime(d.year, d.month, d.day + n);
// Dart weekday is Mon=1..Sun=7; the grid wants Sun=0..Sat=6.
int _weekday(DateTime d) => d.weekday % 7;

class SkyCell {
  SkyCell({
    required this.day,
    required this.week,
    required this.weekday,
    this.amount,
    this.value,
    this.count = 0,
    this.since,
  });

  /// Local midnight of the day.
  final DateTime day;

  /// Column, 0 = the first week shown.
  final int week;

  /// Row, 0 = Sunday.
  final int weekday;

  /// Null = outside the range, still to come, or (portfolio) no reading.
  Decimal? amount;

  /// [amount] as a double, for drawing. Signed for portfolio change.
  double? value;

  /// Entries behind the figure (spending), or 0.
  int count;

  /// Portfolio change only: the earlier reading this change is measured from.
  DateTime? since;
}

class Skyline {
  const Skyline(this.cells, this.weeks);
  final List<SkyCell> cells;
  final int weeks;
}

/// The [n] whole weeks ending with the week that contains [today].
SkyRange lastWeeks(DateTime today, int n) {
  final day = _day(today);
  final sat = _addDays(day, 6 - _weekday(day));
  return SkyRange(_addDays(sat, -(n * 7) + 1), sat);
}

/// [range], cut to its most recent [maxWeeks] whole weeks if it is longer.
/// The bool says whether anything was cut.
(SkyRange, bool) clipToWeeks(SkyRange range, int maxWeeks) {
  final limit = lastWeeks(range.end, maxWeeks);
  if (!range.start.isBefore(limit.start)) return (range, false);
  return (SkyRange(limit.start, range.end), true);
}

({List<SkyCell> cells, Map<DateTime, SkyCell> index, int weeks}) _grid(
  SkyRange range,
  DateTime today,
) {
  final first = range.start;
  final gridStart = _addDays(first, -_weekday(first));
  final last = range.end;
  final gridEnd = _addDays(last, 6 - _weekday(last));
  final cutoff = _day(today);
  final cells = <SkyCell>[];
  final index = <DateTime, SkyCell>{};
  var i = 0;
  for (
    var day = gridStart;
    !day.isAfter(gridEnd);
    day = _addDays(day, 1), i++
  ) {
    final live =
        !day.isBefore(first) && !day.isAfter(last) && !day.isAfter(cutoff);
    final cell = SkyCell(
      day: day,
      week: i ~/ 7,
      weekday: i % 7,
      amount: live ? Decimal.zero : null,
      value: live ? 0 : null,
    );
    cells.add(cell);
    if (live) index[day] = cell;
  }
  return (cells: cells, index: index, weeks: cells.length ~/ 7);
}

/// Spending per day across [range], up to and including [today].
///
/// "Spending" is [TxnType.expense], the same rule the rest of the app uses
/// (`dailyFlow`, the cash-flow card): the app has no separate investment
/// transaction type.
Skyline spendSkyline(List<Txn> txns, SkyRange range, DateTime today) {
  final g = _grid(range, today);
  for (final t in txns) {
    if (t.type != TxnType.expense) continue;
    final cell = g.index[_day(t.date)];
    if (cell == null) continue;
    cell.amount = cell.amount! + t.amount;
    cell.count += 1;
  }
  for (final c in g.index.values) {
    c.value = c.amount!.toDouble();
  }
  return Skyline(g.cells, g.weeks);
}

/// Change in portfolio value per day, from the daily snapshots.
///
/// A snapshot is taken on days the app is opened, so readings have gaps. A
/// day's change is measured from the previous reading, however far back, and
/// [SkyCell.since] says from when, so the card can say "since 12 Nov" instead
/// of pretending a week's movement happened in one day. Days without a reading
/// have no figure (null), not a zero. It is value change: buying more units
/// raises it as much as a rising market does.
Skyline portfolioSkyline(
  List<NetWorthSnapshot> snapshots,
  SkyRange range,
  DateTime today,
) {
  final g = _grid(range, today);
  for (final c in g.index.values) {
    c.amount = null;
    c.value = null;
  }
  // Last reading per day, oldest first.
  final sorted = [...snapshots]..sort((a, b) => a.date.compareTo(b.date));
  final byDay = <DateTime, NetWorthSnapshot>{};
  for (final s in sorted) {
    byDay[_day(s.date)] = s;
  }
  final days = byDay.keys.toList()..sort();
  DateTime? prevDay;
  Decimal? prevValue;
  for (final day in days) {
    final value = byDay[day]!.investments;
    final cell = g.index[day];
    if (cell != null && prevDay != null && prevValue != null) {
      cell.amount = value - prevValue;
      cell.value = cell.amount!.toDouble();
      cell.since = prevDay;
    }
    prevDay = day;
    prevValue = value;
  }
  return Skyline(g.cells, g.weeks);
}

class SpendStats {
  const SpendStats({
    required this.total,
    required this.busiest,
    required this.quietDays,
    required this.pastDays,
    required this.longestQuiet,
  });

  final Decimal total;
  final SkyCell? busiest;

  /// Days in range so far with nothing spent.
  final int quietDays;

  /// Days in range so far.
  final int pastDays;

  /// Longest run of consecutive no-spend days.
  final int longestQuiet;
}

SpendStats spendStats(Skyline sky) {
  var total = Decimal.zero;
  SkyCell? busiest;
  var quiet = 0;
  var past = 0;
  var run = 0;
  var longest = 0;
  for (final c in sky.cells) {
    final a = c.amount;
    if (a == null) continue;
    past += 1;
    total += a;
    if (a == Decimal.zero) {
      quiet += 1;
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
      if (busiest == null || a > busiest.amount!) busiest = c;
    }
  }
  return SpendStats(
    total: total,
    busiest: busiest,
    quietDays: quiet,
    pastDays: past,
    longestQuiet: longest,
  );
}

class ChangeStats {
  const ChangeStats({
    required this.net,
    required this.best,
    required this.worst,
    required this.upDays,
    required this.downDays,
  });

  /// Sum of the changes shown: first reading in range to the last.
  final Decimal net;
  final SkyCell? best;
  final SkyCell? worst;
  final int upDays;
  final int downDays;
}

ChangeStats changeStats(Skyline sky) {
  var net = Decimal.zero;
  SkyCell? best;
  SkyCell? worst;
  var up = 0;
  var down = 0;
  for (final c in sky.cells) {
    final a = c.amount;
    if (a == null) continue;
    net += a;
    if (a > Decimal.zero) {
      up += 1;
      if (best == null || a > best.amount!) best = c;
    }
    if (a < Decimal.zero) {
      down += 1;
      if (worst == null || a < worst.amount!) worst = c;
    }
  }
  return ChangeStats(
    net: net,
    best: best,
    worst: worst,
    upDays: up,
    downDays: down,
  );
}
