import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart' show Value;
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../data/database/app_database.dart';
import '../../domain/services/notification_scheduler.dart';
import '../di/data_providers.dart';
import 'notification_service.dart';

/// The single delivery service. Lived in `features/budget/providers` until the
/// scheduler arrived, which was fine while budgets were the only thing that ever
/// notified — bills, renewals, goals and the digest all need it now, and none of
/// them should have to import the budget feature to get it.
final notificationServiceProvider =
    Provider<NotificationService>((ref) => NotificationService());

/// Where notifications point on this platform. Flutter nests everything under
/// `/app`; the web client does not, which is why the planner takes these rather
/// than hardcoding either.
const notifyRoutes = NotifyRoutes(
  budget: '/app/budget',
  dashboard: '/app/dashboard',
);

/// iOS silently drops the 65th pending local notification, app-wide. Everything
/// else gets a ceiling that is generous but not unbounded.
int maxPendingFor({required bool isApplePlatform}) => isApplePlatform ? 64 : 200;

/// User-facing notification settings.
///
/// One JSON string under one key, rather than a dozen booleans: the fields are
/// only ever read together, and a dozen separate writes is a dozen chances to
/// half-apply a change. Preferences, not the keychain — none of this is a
/// secret, and every keychain item costs a macOS prompt.
class NotifyPrefsNotifier extends Notifier<NotifyPrefs> {
  static const _key = 'notification_prefs_v1';

  @override
  NotifyPrefs build() {
    _load();
    // Off until asked for. Notification permission is something the user grants
    // from Settings having read what it does, not something a first launch takes
    // while they are still working out what the app is.
    return const NotifyPrefs();
  }

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw == null) return;
      state = NotifyPrefs.fromJson(
          jsonDecode(raw) as Map<String, dynamic>);
    } on Object {
      // An unreadable preference must never stop the app. The defaults are a
      // perfectly good answer, and `fromJson` already falls back field by field.
    }
  }

  Future<void> set(NotifyPrefs next) async {
    state = next;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key, jsonEncode(next.toJson()));
    } on Object {
      // The change already applies to this session; failing to remember it is
      // not worth undoing it in front of the user.
    }
  }

  Future<void> setEnabled(bool value) => set(state.copyWith(enabled: value));

  Future<void> toggleCategory(NotifyCategory c, bool on) {
    final next = {...state.categories};
    on ? next.add(c) : next.remove(c);
    return set(state.copyWith(categories: next));
  }
}

final notifyPrefsProvider =
    NotifierProvider<NotifyPrefsNotifier, NotifyPrefs>(NotifyPrefsNotifier.new);

/// dedupeKey -> when it last fired.
///
/// The cooldown reads this, and it is what stops the bug where saving five
/// expenses against an over-budget category produced five identical
/// notifications.
///
/// Backed by the encrypted `notification_deliveries` table, not memory. While it
/// was in memory the cooldown only held within one session, so quitting and
/// reopening the app re-armed every alert and the bug came straight back — the
/// state is kept in memory here for synchronous reads by the planner and written
/// through to the vault on every record.
class DeliveryLog extends Notifier<Map<String, int>> {
  @override
  Map<String, int> build() {
    unawaited(_hydrate());
    return const {};
  }

  /// Loads the log once the database is available. Best-effort: a cooldown that
  /// cannot be read should cost an extra notification, never a failed launch.
  Future<void> _hydrate() async {
    try {
      final db = await ref.read(appDatabaseProvider.future);
      final vaultId = ref.read(currentVaultIdProvider);
      final rows = await db.notificationDeliveryDao.recentFor(vaultId);
      if (rows.isEmpty) return;
      state = {
        for (final r in rows)
          // Keep the most recent fire per key; the DAO returns newest first.
          if (!state.containsKey(r.dedupeKey)) r.dedupeKey: r.firedAt,
      };
    } on Object catch (e) {
      debugPrint('DeliveryLog: could not read the delivery log ($e)');
    }
  }

  void record(Iterable<PlannedNotification> fired, int at,
      {String source = 'immediate'}) {
    if (fired.isEmpty) return;
    state = {...state, for (final n in fired) n.dedupeKey: at};
    unawaited(_persist(fired, at, source));
  }

  Future<void> _persist(
      Iterable<PlannedNotification> fired, int at, String source) async {
    try {
      final db = await ref.read(appDatabaseProvider.future);
      final vaultId = ref.read(currentVaultIdProvider);
      await db.notificationDeliveryDao.recordAll([
        for (final n in fired)
          NotificationDeliveriesCompanion.insert(
            // Keyed by dedupe key + fire time, so a re-record of the same
            // notification replaces rather than accumulating a row per attempt.
            id: '${n.dedupeKey}@$at',
            vaultId: vaultId,
            dedupeKey: n.dedupeKey,
            category: n.category.key,
            title: n.title,
            body: n.body,
            deepLink: Value(n.deepLink),
            scheduledFor:
                Value(source == 'scheduled' ? n.fireAt : null),
            firedAt: at,
            source: source,
          ),
      ]);
    } on Object catch (e) {
      // The notification already went out. Failing to remember it means one
      // extra alert later, which is not worth surfacing an error for.
      debugPrint('DeliveryLog: could not persist a delivery ($e)');
    }
  }

  void clear() => state = const {};
}

final deliveryLogProvider =
    NotifierProvider<DeliveryLog, Map<String, int>>(DeliveryLog.new);
