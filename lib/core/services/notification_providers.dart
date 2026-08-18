import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../domain/services/notification_scheduler.dart';
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
/// The cooldown reads this, and it is what stops the original bug where saving
/// five expenses against an over-budget category produced five identical
/// notifications. In memory for now; Phase 3 moves it into the encrypted vault
/// so it survives a restart, which is the only thing keeping the cooldown from
/// being honoured across sessions.
class DeliveryLog extends Notifier<Map<String, int>> {
  @override
  Map<String, int> build() => const {};

  void record(Iterable<PlannedNotification> fired, int at) {
    if (fired.isEmpty) return;
    state = {...state, for (final n in fired) n.dedupeKey: at};
  }

  void clear() => state = const {};
}

final deliveryLogProvider =
    NotifierProvider<DeliveryLog, Map<String, int>>(DeliveryLog.new);
