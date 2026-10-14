/// Builds the "Send feedback" email and the "Report a problem" share text.
///
/// Everything here is pure so it can be unit-tested, and deliberately narrow:
/// the only facts that ever go into a feedback message are the ones in
/// [FeedbackDeviceInfo] — app version, build channel, OS, locale, theme and a
/// coarse screen size. No vault name, account, amount or PIN can reach the
/// message because none of them is an input.
///
/// There is no server. The message is handed to the user's own mail app, and
/// nothing is sent unless they press Send there.
library;

import '../branding.dart';

/// The non-financial facts attached to a feedback email.
class FeedbackDeviceInfo {
  const FeedbackDeviceInfo({
    required this.appVersion,
    required this.channel,
    required this.platform,
    required this.osVersion,
    required this.locale,
    required this.themeMode,
    required this.screenClass,
  });

  /// e.g. `1.0.0`.
  final String appVersion;

  /// Build channel name: `play`, `appStore` or `direct`.
  final String channel;

  /// Short platform name, e.g. `android`, `ios`, `macos`.
  final String platform;

  /// `Platform.operatingSystemVersion`, trimmed to [kMaxOsVersionLength].
  final String osVersion;

  /// e.g. `en_IN`.
  final String locale;

  /// `system`, `light` or `dark`.
  final String themeMode;

  /// `compact`, `medium` or `expanded` — see [screenSizeClass].
  final String screenClass;
}

/// Long `operatingSystemVersion` strings (Linux kernels, some Android OEMs)
/// are cut so they cannot crowd out the message itself.
const kMaxOsVersionLength = 80;

/// Material 3 window size class for a logical width. A class rather than the
/// exact pixel size: it is what matters for layout bugs and says less about the
/// specific device.
String screenSizeClass(double logicalWidth) {
  if (logicalWidth < 600) return 'compact';
  if (logicalWidth < 840) return 'medium';
  return 'expanded';
}

/// Subject line: `Khazana feedback — 1.0.0 (android)`.
String feedbackSubject(FeedbackDeviceInfo info) =>
    '$kAppName feedback — ${info.appVersion} (${info.platform})';

/// Body template: room for the message first, then the device block.
String feedbackBody(FeedbackDeviceInfo info) {
  final os = info.osVersion.length > kMaxOsVersionLength
      ? '${info.osVersion.substring(0, kMaxOsVersionLength)}…'
      : info.osVersion;
  return [
    '',
    '',
    '',
    '— About this device (no financial data) —',
    'App version: ${info.appVersion}',
    'Build channel: ${info.channel}',
    'OS: ${info.platform} $os',
    'Locale: ${info.locale}',
    'Theme: ${info.themeMode}',
    'Screen: ${info.screenClass}',
  ].join('\n');
}

/// The `mailto:` URI for "Send feedback".
///
/// The query is assembled by hand with [Uri.encodeComponent] rather than
/// `Uri(queryParameters: …)`, because the latter encodes spaces as `+`, which
/// several mail apps (Gmail on Android among them) show literally.
Uri buildFeedbackMailto(FeedbackDeviceInfo info, {String to = kFeedbackEmail}) {
  final query =
      'subject=${Uri.encodeComponent(feedbackSubject(info))}'
      '&body=${Uri.encodeComponent(feedbackBody(info))}';
  return Uri.parse('mailto:$to?$query');
}

/// Text that accompanies the sanitized error log in the share sheet, so that
/// whichever app the user picks, the recipient is obvious.
String problemReportShareText({String to = kFeedbackEmail}) =>
    '$kAppName problem report (error log, no financial data).\n\n'
    'Please send this to $to along with a line or two about what you were '
    'doing when it went wrong.';

/// Subject used when the share target supports one (email apps do).
const kProblemReportSubject = '$kAppName problem report — $kAppVersion';
