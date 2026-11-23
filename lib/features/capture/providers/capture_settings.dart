import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Whether confident captures go straight to the ledger, or every capture waits
/// in the review inbox ("Always review" — the v1 behaviour).
///
/// A preference, not a secret, so it lives in shared preferences like the theme.
/// Defaults to automatic: removing manual entry is the point of the feature,
/// and every automatic add is announced with an Undo.
class CaptureAutoPostNotifier extends Notifier<bool> {
  static const _key = 'capture_auto_post_v1';

  @override
  bool build() {
    _load();
    return true;
  }

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getBool(_key);
      if (saved != null) state = saved;
    } on Object {
      // Unreadable preference: keep the default rather than fail the screen.
    }
  }

  Future<void> set(bool value) async {
    state = value;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_key, value);
    } on Object {
      // Applies for this session even if it can't be remembered.
    }
  }
}

final captureAutoPostProvider =
    NotifierProvider<CaptureAutoPostNotifier, bool>(CaptureAutoPostNotifier.new);

/// The day choices offered for reading past bank SMS.
const smsHistoryDayOptions = [1, 2, 7, 30, 90];

/// How far back "Import" reads the SMS inbox, in days. Defaults to 1.
///
/// It used to be a fixed 90 days, which on a busy account queued hundreds of
/// captures for review in one tap. One day covers what arrived while the app
/// was closed; anyone who wants more history picks a longer window.
class CaptureSmsHistoryDaysNotifier extends Notifier<int> {
  static const _key = 'capture_sms_history_days_v1';
  static const defaultDays = 1;

  @override
  int build() {
    _load();
    return defaultDays;
  }

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getInt(_key);
      if (saved != null && saved > 0) state = saved;
    } on Object {
      // Unreadable preference: keep the default rather than fail the screen.
    }
  }

  Future<void> set(int days) async {
    if (days <= 0) return;
    state = days;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(_key, days);
    } on Object {
      // Applies for this session even if it can't be remembered.
    }
  }
}

final captureSmsHistoryDaysProvider =
    NotifierProvider<CaptureSmsHistoryDaysNotifier, int>(
        CaptureSmsHistoryDaysNotifier.new);

/// "1 day", "7 days".
String smsHistoryLabel(int days) => '$days day${days == 1 ? '' : 's'}';
