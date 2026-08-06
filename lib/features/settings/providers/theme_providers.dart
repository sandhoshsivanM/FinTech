import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Which theme the app renders in.
///
/// Persisted in preferences, not the keychain: a display preference is not a
/// secret, and reading one at launch must never cost an OS password prompt.
///
/// Loaded synchronously from a cached value after the first read so the app
/// does not paint one theme and then swap — a flash of the wrong background on
/// every cold start is worse than a moment of the default.
class ThemeModeNotifier extends Notifier<ThemeMode> {
  static const _key = 'theme_mode_v1';

  @override
  ThemeMode build() {
    _load();
    // System, not a hardcoded side. The app has no opinion about whether this
    // person works in daylight; their OS already knows, and honouring it is the
    // only default that is right for both of them.
    return ThemeMode.system;
  }

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_key);
      if (saved == null) return;
      final mode = ThemeMode.values.where((m) => m.name == saved).firstOrNull;
      if (mode != null) state = mode;
    } on Object {
      // An unreadable preference must never stop the app rendering. The
      // system default is a perfectly good answer.
    }
  }

  Future<void> set(ThemeMode mode) async {
    state = mode;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key, mode.name);
    } on Object {
      // The change already applies to this session; failing to remember it is
      // not worth undoing it in front of the user.
    }
  }
}

final themeModeProvider =
    NotifierProvider<ThemeModeNotifier, ThemeMode>(ThemeModeNotifier.new);

/// Label for the settings control.
extension ThemeModeLabel on ThemeMode {
  String get label => switch (this) {
        ThemeMode.system => 'System',
        ThemeMode.light => 'Light',
        ThemeMode.dark => 'Dark',
      };
}
