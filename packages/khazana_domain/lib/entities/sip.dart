import 'package:decimal/decimal.dart';

import 'holding.dart';

/// A plain calendar date, timezone-free. SIP dates are bank-calendar days, not
/// instants: storing them as epoch ms is how a 5th-of-month SIP turns into the
/// 4th for anyone east of UTC. Serialised as `YYYY-MM-DD`, which is also how
/// the TypeScript twin carries them.
class CalendarDate implements Comparable<CalendarDate> {
  const CalendarDate(this.year, this.month, this.day);

  factory CalendarDate.of(DateTime d) => CalendarDate(d.year, d.month, d.day);

  static CalendarDate parse(String iso) {
    final p = iso.split('-');
    if (p.length != 3) throw FormatException('Not a YYYY-MM-DD date', iso);
    return CalendarDate(int.parse(p[0]), int.parse(p[1]), int.parse(p[2]));
  }

  final int year;
  final int month;
  final int day;

  DateTime toDateTime() => DateTime(year, month, day);

  /// Days from [other] to this date (positive when this is later).
  int daysSince(CalendarDate other) =>
      DateTime.utc(year, month, day)
          .difference(DateTime.utc(other.year, other.month, other.day))
          .inDays;

  CalendarDate addDays(int n) {
    final d = DateTime.utc(year, month, day).add(Duration(days: n));
    return CalendarDate(d.year, d.month, d.day);
  }

  String get iso =>
      '${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';

  @override
  int compareTo(CalendarDate other) => year != other.year
      ? year - other.year
      : month != other.month
          ? month - other.month
          : day - other.day;

  bool operator <(CalendarDate o) => compareTo(o) < 0;
  bool operator <=(CalendarDate o) => compareTo(o) <= 0;
  bool operator >(CalendarDate o) => compareTo(o) > 0;
  bool operator >=(CalendarDate o) => compareTo(o) >= 0;

  @override
  bool operator ==(Object other) =>
      other is CalendarDate && compareTo(other) == 0;

  @override
  int get hashCode => Object.hash(year, month, day);

  @override
  String toString() => iso;
}

/// A monthly SIP the user pays elsewhere (their bank or broker) and tracks
/// here. Khazana never moves money: a plan only produces reminders, and units
/// are recorded when the user taps Mark done.
class SipPlan {
  const SipPlan({
    required this.id,
    required this.vaultId,
    required this.instrumentId,
    required this.name,
    required this.assetType,
    required this.amount,
    required this.dayOfMonth,
    required this.startDate,
    this.stepUpPct = 0,
    this.remind = true,
    this.active = true,
  });

  final String id;
  final String vaultId;

  /// The holding the units go into.
  final String instrumentId;

  /// Display name, copied from the instrument so a reminder can be written
  /// without a join.
  final String name;
  final AssetType assetType;

  /// Instalment amount in the first year, before any step-up.
  final Decimal amount;

  /// 1–31. In shorter months the SIP falls on the month's last day, which is
  /// what AMCs do.
  final int dayOfMonth;
  final CalendarDate startDate;

  /// Yearly increase, applied every April. 0 = none.
  final int stepUpPct;
  final bool remind;

  /// False while paused. A paused plan keeps its history but is not due.
  final bool active;

  SipPlan copyWith({
    Decimal? amount,
    int? dayOfMonth,
    CalendarDate? startDate,
    int? stepUpPct,
    bool? remind,
    bool? active,
  }) =>
      SipPlan(
        id: id,
        vaultId: vaultId,
        instrumentId: instrumentId,
        name: name,
        assetType: assetType,
        amount: amount ?? this.amount,
        dayOfMonth: dayOfMonth ?? this.dayOfMonth,
        startDate: startDate ?? this.startDate,
        stepUpPct: stepUpPct ?? this.stepUpPct,
        remind: remind ?? this.remind,
        active: active ?? this.active,
      );
}

enum SipInstalmentStatus {
  done('done'),
  skipped('skipped');

  const SipInstalmentStatus(this.key);
  final String key;

  static SipInstalmentStatus fromKey(String k) =>
      SipInstalmentStatus.values.firstWhere((s) => s.key == k,
          orElse: () => throw ArgumentError.value(k, 'k', 'Unknown status'));
}

/// The user's answer for one due date.
class SipInstalment {
  const SipInstalment({
    required this.id,
    required this.sipId,
    required this.dueDate,
    required this.status,
    required this.amount,
    this.units,
    this.nav,
    this.tradeId,
  });

  final String id;
  final String sipId;
  final CalendarDate dueDate;
  final SipInstalmentStatus status;

  /// What was invested. Zero for a skipped month.
  final Decimal amount;
  final Decimal? units;
  final Decimal? nav;

  /// The buy this created, so Undo can remove exactly that trade.
  final String? tradeId;
}
