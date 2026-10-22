// Khazana (offline) never talks to our backend, never signs in and never syncs
// through a server: that is Khazana Online, a separate app in mobile-online/
// (ADR 0007). These checks fail the build if online code finds its way in.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// The gateway's own route prefixes (/v1/auth, /v1/sync, …), read from its
/// config so a new backend route is banned here the day it is added.
List<String> gatewayPrefixes() {
  final config = jsonDecode(File('backend/Khazana.Gateway/appsettings.json').readAsStringSync())
      as Map<String, dynamic>;
  final routes = (config['ReverseProxy'] as Map<String, dynamic>)['Routes'] as Map<String, dynamic>;
  final prefix = RegExp(r'^(/v1/[^/{]+)');
  return {
    for (final r in routes.values)
      if (prefix.firstMatch(((r as Map<String, dynamic>)['Match'] as Map<String, dynamic>)['Path'] as String)
          case final m?)
        m.group(1)!,
  }.toList();
}

void main() {
  final banned = [
    ...gatewayPrefixes(),
    'DPoP', 'access_token', 'refresh_token', 'passkey',
    'webapp-online', 'mobile-online', 'khazana_online',
  ];

  test('the gateway prefixes were found (the guard is not empty)', () {
    expect(gatewayPrefixes(), containsAll(['/v1/auth', '/v1/sync']));
  });

  // The shared domain package is compiled into this app, so it is held to the
  // same rule (Khazana Online keeps its online code in its own app).
  test('no backend routes, tokens, sign-in or online-app imports in lib/ or the shared package', () {
    final hits = [
      for (final dir in ['lib', 'packages/khazana_domain/lib'])
        for (final f in Directory(dir).listSync(recursive: true).whereType<File>())
          if (f.path.endsWith('.dart'))
            for (final word in banned)
              if (f.readAsStringSync().contains(word)) '${f.path}: $word',
    ];
    expect(hits, isEmpty, reason: 'Online code belongs in mobile-online/ (ADR 0007)');
  });

  test('no sign-in or backend client packages', () {
    final auth = RegExp(
        r'^\s+(google_sign_in|sign_in_with_apple|passkeys|firebase_\w+|flutter_appauth|oauth2):',
        multiLine: true);
    final hits = auth.allMatches(File('pubspec.yaml').readAsStringSync()).map((m) => m.group(1)).toList();
    expect(hits, isEmpty);
  });
}
