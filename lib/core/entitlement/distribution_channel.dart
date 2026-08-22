/// How this build was distributed, and therefore how it may take money.
///
/// Set at compile time:
///
/// ```
///   flutter build ipa       --dart-define=KHAZANA_CHANNEL=appStore
///   flutter build appbundle --dart-define=KHAZANA_CHANNEL=play
///   flutter build macos     --dart-define=KHAZANA_CHANNEL=direct
/// ```
///
/// **This is compile-time and not a runtime setting for a specific reason.**
/// App Store Guideline 3.1.1 forbids an app from steering users to a purchase
/// mechanism outside the store, and 3.1.3 governs when it may even mention one.
/// A licence-key entry field guarded by a runtime `if` is still *present in the
/// binary*, still findable by a reviewer, and is a rejection waiting to happen.
/// Reading the channel from `String.fromEnvironment` lets the tree-shaker drop
/// that entire code path from the App Store build, so the affordance does not
/// exist rather than being hidden.
///
/// The default is [Channel.direct] because that is the build a developer gets
/// by typing `flutter run`, and the direct channel is the one that works with
/// no store attached.
enum Channel {
  /// iOS, iPadOS, Mac App Store. StoreKit only; no licence keys, no links out.
  appStore,

  /// Google Play. Play Billing only.
  play,

  /// Direct download — the notarized macOS DMG, the Tauri desktop app, the web
  /// app. Licence keys only; no store SDK.
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

/// Whether this build talks to an app store's billing SDK.
bool get kUsesStoreBilling =>
    kChannel == Channel.appStore || kChannel == Channel.play;

/// Whether this build may show a licence-key field and an external checkout.
///
/// False in every store build. Guard the UI with this, not with a platform
/// check — the Mac App Store build and the notarized DMG are the same platform
/// and must behave differently.
bool get kUsesLicenseKeys => kChannel == Channel.direct;

/// Development escape hatch: `--dart-define=KHAZANA_PRO=true` unlocks
/// everything without a store or a key.
///
/// Compile-time, so it cannot be switched on in a shipped binary, and it is
/// recorded as [ProSource.devOverride] rather than pretending to be a purchase
/// — a screenshot taken with this on should be identifiable as such.
const bool kProOverride = bool.fromEnvironment('KHAZANA_PRO');
