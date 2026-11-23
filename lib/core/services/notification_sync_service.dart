import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:decimal/decimal.dart';
import 'package:khazana_domain/entities/recurring_rule.dart';
import 'package:khazana_domain/entities/transaction.dart';
import 'package:khazana_domain/services/notification_scheduler.dart';
import '../../features/capture/providers/capture_providers.dart';
import '../../features/investments/providers/sip_providers.dart';
import '../../features/investments/services/sip_reminders.dart';
import '../../features/transactions/providers/transaction_providers.dart';
import '../di/data_providers.dart';
import '../utils/money_format.dart';
import 'notification_providers.dart';

/// Keeps the OS's pending reminders in step with the vault.
///
/// The vault is readable only while unlocked, and the OS fires reminders only
/// while the app is closed — so the two never overlap. This is the handover
/// point: everything the user might need to hear about in the coming weeks is
/// rendered to text here, while the key is in memory, and handed to
/// AlarmManager / UNUserNotificationCenter to say later.
///
/// Consequence worth being clear about: a reminder says what was true the last
/// time Khazana was open. That is why [reconcile] runs on unlock, on resume and
/// after every write that could change a date — the more often it runs, the
/// shorter the window in which a reminder can go stale.
class NotificationSyncService {
  NotificationSyncService(this._ref);

  final Ref _ref;
  Timer? _debounce;

  /// Coalesces the burst of writes a single user action produces. Editing a
  /// recurring rule touches the rule, its transactions and its next run in
  /// quick succession; rebuilding the whole plan three times would be waste.
  void scheduleReconcile({Duration delay = const Duration(seconds: 2)}) {
    _debounce?.cancel();
    _debounce = Timer(delay, () => unawaited(reconcile()));
  }

  void dispose() => _debounce?.cancel();

  /// Rebuilds the plan and hands the difference to the OS.
  Future<({int added, int removed, int kept, int truncated})> reconcile() async {
    final service = _ref.read(notificationServiceProvider);
    final prefs = _ref.read(notifyPrefsProvider);

    // Switching notifications off has to actually drop the alarms. They outlive
    // the app, so leaving them pending would keep talking after being told to
    // stop — and would still be talking about data the user may since have
    // erased.
    if (!prefs.enabled) {
      await service.cancelAll();
      return (added: 0, removed: 0, kept: 0, truncated: 0);
    }

    final now = DateTime.now();
    final plan = planNotifications(NotificationPlanInput(
      now: now.millisecondsSinceEpoch,
      tzOffsetMinutes: now.timeZoneOffset.inMinutes,
      routes: notifyRoutes,
      prefs: prefs,
      deliveries: _ref.read(deliveryLogProvider),
      dueEvents: await _collectDueEvents(),
      today: _today(now),
      maxPending: maxPendingFor(
        isApplePlatform: defaultTargetPlatform == TargetPlatform.iOS ||
            defaultTargetPlatform == TargetPlatform.macOS,
      ),
    ));

    if (plan.truncated > 0) {
      // Not silent: a cut that nobody can see reads as "everything is covered".
      debugPrint('NotificationSync: ${plan.truncated} reminder(s) beyond the '
          'platform cap were not scheduled; the next reconcile will pick up the '
          'nearest of them.');
    }

    // `missed` is deliberately dropped here rather than fired. On mobile the OS
    // already delivered these while the app was closed, so re-showing them on
    // open would say everything twice. The web client, which has no OS
    // scheduler, is the one that consumes them.
    final r = await service.reconcile([
      ...plan.scheduled,
      ...await _sipReminders(prefs, now),
    ]);
    return (
      added: r.added,
      removed: r.removed,
      kept: r.kept,
      truncated: plan.truncated,
    );
  }

  /// SIP due-date reminders. A failure here must not take the rest of the
  /// plan down with it.
  Future<List<PlannedNotification>> _sipReminders(
      NotifyPrefs prefs, DateTime now) async {
    try {
      final vaultId = _ref.read(currentVaultIdProvider);
      final repo = _ref.read(sipRepositoryProvider);
      return planSipReminders(
        plans: await repo.plans(vaultId),
        instalments: await repo.instalments(vaultId),
        prefs: prefs,
        now: now,
        deepLink: '/app/investments/sips',
      );
    } on Object catch (e) {
      debugPrint('NotificationSync: SIPs unavailable ($e)');
      return const [];
    }
  }

  /// Today's ledger and review queue, for the evening digest.
  TodayFact _today(DateTime now) {
    final state = _ref.read(transactionListProvider);
    final txns = state is TransactionData ? state.transactions : const <Txn>[];
    final pending = _ref.read(pendingCaptureListProvider).valueOrNull?.length ?? 0;
    return todayFactFrom(txns, now, toReview: pending);
  }

  /// Flattens the vault's dated records into the planner's one shape.
  ///
  /// Only what has a date known in advance and unchangeable from off-device.
  /// Prices are excluded on purpose: a price crossing depends on data that moves
  /// while the phone is in a pocket, and pre-scheduling "RELIANCE crossed 3,000"
  /// would be scheduling a guess.
  Future<List<DueEvent>> _collectDueEvents() async {
    final vaultId = _ref.read(currentVaultIdProvider);
    final events = <DueEvent>[];

    Future<List<T>> first<T>(Stream<List<T>> s) =>
        s.first.timeout(const Duration(seconds: 5), onTimeout: () => const []);

    try {
      final rules = await _ref.read(recurringRepositoryProvider).activeRules(vaultId);
      for (final r in rules) {
        events.add(DueEvent(
          id: r.id,
          category: NotifyCategory.bills,
          label: r.merchant?.trim().isNotEmpty == true
              ? r.merchant!.trim()
              : _frequencyLabel(r.frequency),
          dueAt: r.nextRun.millisecondsSinceEpoch,
          deepLink: '/app/transactions',
          amountText: r.amount.toString(),
        ));
      }
    } on Object catch (e) {
      debugPrint('NotificationSync: recurring rules unavailable ($e)');
    }

    try {
      final policies =
          await first(_ref.read(insuranceRepositoryProvider).watch(vaultId));
      for (final p in policies) {
        final at = p.renewalDate;
        if (at == null) continue;
        events.add(DueEvent(
          id: p.id,
          category: NotifyCategory.renewals,
          label: p.name,
          dueAt: at.millisecondsSinceEpoch,
          deepLink: '/app/insurance',
          amountText: p.premium.toString(),
        ));
      }
    } on Object catch (e) {
      debugPrint('NotificationSync: insurance unavailable ($e)');
    }

    try {
      final goals = await first(_ref.read(goalRepositoryProvider).watch(vaultId));
      for (final g in goals) {
        final at = g.targetDate;
        // An achieved goal's target date is a date it already beat.
        if (at == null || g.isAchieved) continue;
        events.add(DueEvent(
          id: g.id,
          category: NotifyCategory.goals,
          label: g.name,
          dueAt: at.millisecondsSinceEpoch,
          deepLink: '/app/goals',
          amountText: g.targetAmount.toString(),
        ));
      }
    } on Object catch (e) {
      debugPrint('NotificationSync: goals unavailable ($e)');
    }

    return events;
  }

  String _frequencyLabel(Frequency f) => switch (f) {
        Frequency.daily => 'Daily transaction',
        Frequency.weekly => 'Weekly transaction',
        Frequency.monthly => 'Monthly transaction',
        Frequency.yearly => 'Yearly transaction',
      };
}

final notificationSyncProvider = Provider<NotificationSyncService>((ref) {
  final service = NotificationSyncService(ref);
  ref.onDispose(service.dispose);
  return service;
});

/// Convenience for the entities that have no notifier of their own to hang a
/// reconcile off. Unused parameters kept out deliberately — callers just fire.
extension NotificationReconcileOnWrite on Ref {
  void reconcileNotifications() =>
      read(notificationSyncProvider).scheduleReconcile();
}

/// Sums [txns] dated on [now]'s local day. Pure, so it is tested on its own.
TodayFact todayFactFrom(Iterable<Txn> txns, DateTime now, {int toReview = 0}) {
  var spent = Decimal.zero;
  var received = Decimal.zero;
  var spentCount = 0;
  var receivedCount = 0;
  for (final t in txns) {
    final d = t.date;
    if (d.year != now.year || d.month != now.month || d.day != now.day) continue;
    if (t.type == TxnType.income) {
      received += t.amount;
      receivedCount++;
    } else {
      spent += t.amount;
      spentCount++;
    }
  }
  return TodayFact(
    spentCount: spentCount,
    receivedCount: receivedCount,
    toReview: toReview,
    spentText: Money.format(spent),
    receivedText: Money.format(received),
  );
}
