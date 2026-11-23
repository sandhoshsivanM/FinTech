import 'package:decimal/decimal.dart';

import '../entities/asset_group.dart';
import '../entities/sip.dart';

/// SIP schedule maths. Mirrors `packages/domain-ts/src/sip.ts`; both suites
/// assert against `test/fixtures/sip_cases.json`.

/// How far back an unanswered instalment still shows as due. Long enough that a
/// month missed while travelling still asks once; short enough that a plan
/// added today does not ask about last year.
const kSipLookbackDays = 35;

/// The step-up month. Indian salaries and SIP top-ups move with the financial
/// year, so the raise lands in April.
const kStepUpMonth = 4;

final _hundred = Decimal.fromInt(100);

int _daysInMonth(int year, int month) => DateTime.utc(year, month + 1, 0).day;

/// The due date in [year]/[month], clamped to the month's last day.
CalendarDate dueDateIn(SipPlan plan, int year, int month) => CalendarDate(
    year, month, plan.dayOfMonth.clamp(1, _daysInMonth(year, month)));

/// Every due date in [from]..[to] (inclusive) on or after the plan's start.
List<CalendarDate> occurrences(
    SipPlan plan, CalendarDate from, CalendarDate to) {
  final start = from < plan.startDate ? plan.startDate : from;
  final out = <CalendarDate>[];
  var y = start.year, m = start.month;
  while (true) {
    final d = dueDateIn(plan, y, m);
    if (d > to) break;
    if (d >= start) out.add(d);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/// Step-ups applied by [on]: one per April 1st after the start date.
int stepUpsBy(SipPlan plan, CalendarDate on) {
  if (plan.stepUpPct <= 0) return 0;
  var n = 0;
  for (var y = plan.startDate.year; y <= on.year; y++) {
    final april = CalendarDate(y, kStepUpMonth, 1);
    if (april > plan.startDate && april <= on) n++;
  }
  return n;
}

/// The instalment amount on [on], step-ups applied, rounded to the rupee.
Decimal amountOn(SipPlan plan, CalendarDate on) {
  final steps = stepUpsBy(plan, on);
  var a = plan.amount;
  final factor = (_hundred + Decimal.fromInt(plan.stepUpPct)) / _hundred;
  for (var i = 0; i < steps; i++) {
    a = (a * factor.toDecimal(scaleOnInfinitePrecision: 12));
  }
  return a.round();
}

/// Due dates the user has not answered yet, oldest first.
List<CalendarDate> pendingDue(
  SipPlan plan,
  List<SipInstalment> instalments,
  CalendarDate today,
) {
  if (!plan.active) return const [];
  final answered = {
    for (final i in instalments)
      if (i.sipId == plan.id) i.dueDate,
  };
  return [
    for (final d
        in occurrences(plan, today.addDays(-kSipLookbackDays), today))
      if (!answered.contains(d)) d,
  ];
}

/// The first due date strictly after [today] (or the first one at all, for a
/// plan that has not started). Null for a paused plan.
CalendarDate? nextDue(SipPlan plan, CalendarDate today) {
  if (!plan.active) return null;
  final after = today < plan.startDate ? plan.startDate.addDays(-1) : today;
  return occurrences(plan, after.addDays(1), after.addDays(62)).first;
}

/// What the active plans cost per month at today's step-up level.
Decimal monthlyTotal(List<SipPlan> plans, CalendarDate today) {
  var t = Decimal.zero;
  for (final p in plans) {
    if (!p.active) continue;
    t += amountOn(p, today < p.startDate ? p.startDate : today);
  }
  return t;
}

/// The financial year (April–March) containing [d], as its first day.
CalendarDate fyStart(CalendarDate d) =>
    CalendarDate(d.month >= kStepUpMonth ? d.year : d.year - 1, kStepUpMonth, 1);

/// Money recorded through Mark done in the current financial year.
Decimal investedThisFy(List<SipInstalment> instalments, CalendarDate today) {
  final from = fyStart(today);
  var t = Decimal.zero;
  for (final i in instalments) {
    if (i.status == SipInstalmentStatus.done &&
        i.dueDate >= from &&
        i.dueDate <= today) {
      t += i.amount;
    }
  }
  return t;
}

/// Units bought: amount ÷ NAV, to 3 decimals as AMCs allot them.
Decimal unitsFor(Decimal amount, Decimal nav) {
  if (nav <= Decimal.zero) {
    throw ArgumentError.value(nav, 'nav', 'NAV must be positive');
  }
  return (amount / nav).toDecimal(scaleOnInfinitePrecision: 12).round(scale: 3);
}

/// Months of SIP needed to put [gap] rupees into a group, ignoring growth.
/// Null when there is no gap or no SIP.
int? monthsToClose(Decimal gap, Decimal monthly) {
  if (gap <= Decimal.zero || monthly <= Decimal.zero) return null;
  return (gap / monthly).ceil().toInt();
}

/// Where monthly SIP money goes, by group.
class SipMixRow {
  const SipMixRow(this.group, this.amount, this.sipPct, this.targetPct);
  final AssetGroup group;
  final Decimal amount;

  /// Share of the monthly SIP total, whole percent.
  final int sipPct;
  final int targetPct;
}

/// A group whose share of new SIP money exceeds its target by more than this
/// many points earns a warning. Wider than the holdings tolerance: SIPs are
/// lumpy (one ₹10k SIP among three is 33%), and a nag every month is noise.
const kSipMixWarnPoints = 10;

List<SipMixRow> sipMix(
  List<SipPlan> plans,
  Map<AssetGroup, int> targets,
  CalendarDate today,
) {
  final total = monthlyTotal(plans, today);
  if (total == Decimal.zero) return const [];
  final by = <AssetGroup, Decimal>{};
  for (final p in plans) {
    if (!p.active) continue;
    final g = AssetGroup.of(p.assetType);
    by[g] = (by[g] ?? Decimal.zero) +
        amountOn(p, today < p.startDate ? p.startDate : today);
  }
  return [
    for (final g in kAssetGroupOrder)
      if (by.containsKey(g))
        SipMixRow(
          g,
          by[g]!,
          (by[g]! * _hundred / total)
              .toDecimal(scaleOnInfinitePrecision: 12)
              .round()
              .toBigInt()
              .toInt(),
          targets[g] ?? 0,
        ),
  ];
}

/// The most over-fed group, or null when nothing clears [kSipMixWarnPoints].
/// Only meaningful once targets exist.
SipMixRow? sipMixWarning(List<SipMixRow> mix) {
  SipMixRow? worst;
  for (final r in mix) {
    final over = r.sipPct - r.targetPct;
    if (over > kSipMixWarnPoints &&
        (worst == null || over > worst.sipPct - worst.targetPct)) {
      worst = r;
    }
  }
  return worst;
}
