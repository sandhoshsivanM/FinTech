// Build-time settings for smart capture (--dart-define). No client IDs or
// secrets live in the repo. The Google client is an "installed app" client: it
// has no client secret, and PKCE protects the code exchange.
const googleClientId = String.fromEnvironment('KHAZANA_GOOGLE_CLIENT_ID');

/// Google's redirect scheme for an installed-app client is the client id with
/// its parts reversed: "123-abc.apps.googleusercontent.com" becomes
/// "com.googleusercontent.apps.123-abc".
String googleRedirectScheme(String clientId) {
  const suffix = '.apps.googleusercontent.com';
  final base = clientId.endsWith(suffix) ? clientId.substring(0, clientId.length - suffix.length) : clientId;
  return 'com.googleusercontent.apps.$base';
}

bool get gmailConfigured => googleClientId.isNotEmpty;
