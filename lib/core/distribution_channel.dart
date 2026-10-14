/// How this build was distributed.
///
/// Set at compile time:
///
/// ```
///   flutter build ipa       --dart-define=KHAZANA_CHANNEL=appStore
///   flutter build appbundle --dart-define=KHAZANA_CHANNEL=play
///   flutter build macos     --dart-define=KHAZANA_CHANNEL=direct
/// ```
///
/// Nothing in the app is sold or gated, so the channel no longer changes what
/// the app can do. It is recorded only so a feedback or problem report says
/// which build it came from.
///
/// The default is [Channel.direct] because that is the build a developer gets
/// by typing `flutter run`.
enum Channel {
  /// iOS, iPadOS, Mac App Store.
  appStore,

  /// Google Play.
  play,

  /// Direct download — the notarized macOS DMG, the Tauri desktop app, the web
  /// app.
  direct,
}

const String _raw = String.fromEnvironment(
  'KHAZANA_CHANNEL',
  defaultValue: 'direct',
);

/// The channel this binary was built for.
final Channel kChannel = Channel.values.firstWhere(
  (c) => c.name.toLowerCase() == _raw.toLowerCase(),
  orElse: () => Channel.direct,
);
