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
