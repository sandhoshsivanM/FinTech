import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:khazana_online/app_services.dart';
import 'package:khazana_online/core/gateway_client.dart';
import 'package:khazana_online/core/key_store.dart';
import 'package:khazana_online/core/passkey.dart';
import 'package:khazana_online/features/sign_in_screen.dart';
import 'package:khazana_online/sync/record_store.dart';

const _tokens = {
  'access_token': 'a', 'token_type': 'DPoP', 'expires_in': 900, 'refresh_token': 'r', 'user_id': 'u1', 'device_id': 'd1',
};

class _Passkeys implements PasskeyCeremony {
  @override
  Future<Json> create(Json options) async => {'id': 'cred'};
  @override
  Future<Json> get(Json options) async => {'id': 'cred'};
}

typedef _Handler = http.Response Function(http.Request);

AppServices _services(_Handler handler, {List<http.Request>? seen, bool passkeys = false}) {
  final store = MemoryKeyStore();
  return AppServices(
      gateway: GatewayClient(
        baseUrl: Uri.parse('http://gw.test'),
        platform: 'android',
        store: store,
        passkeys: passkeys ? _Passkeys() : null,
        client: MockClient((r) async {
          seen?.add(r);
          return handler(r);
        }),
      ),
      keyStore: store,
      records: MemoryRecordStore(),
      deviceName: 'Test phone',
      platform: 'android');
}

http.Response _json(Object body, [int status = 200, Map<String, String> headers = const {}]) =>
    http.Response(jsonEncode(body), status, headers: headers);

Future<void> _type(WidgetTester t, String key, String text) async {
  await t.enterText(find.byKey(Key(key)), text);
  await t.pump();
}

Future<void> _tap(WidgetTester t, String key) async {
  await t.ensureVisible(find.byKey(Key(key)));
  await t.tap(find.byKey(Key(key)));
  await t.pump();
  await t.pump();
}

void main() {
  const challenge = {'challenge_id': 'c1', 'expires_in': 300, 'resend_after': 30};

  testWidgets('leads with the mobile number; passkey and Google sit under other ways', (t) async {
    await t.pumpWidget(MaterialApp(home: SignInScreen(services: _services((_) => _json({})), showDevSignIn: false)));
    expect(find.text('Continue with mobile number'), findsOneWidget);
    expect(find.text('Other ways to sign in'), findsOneWidget);
    final phoneY = t.getTopLeft(find.byKey(const Key('phone-field'))).dy;
    expect(phoneY, lessThan(t.getTopLeft(find.byKey(const Key('passkey-create'))).dy));
    expect(phoneY, lessThan(t.getTopLeft(find.byKey(const Key('google'))).dy));
  });

  testWidgets('a bad number is refused in words before any request', (t) async {
    final seen = <http.Request>[];
    await t.pumpWidget(MaterialApp(home: SignInScreen(services: _services((_) => _json(challenge), seen: seen), showDevSignIn: false)));
    await _type(t, 'phone-field', '12345');
    await _tap(t, 'send-code');
    expect(find.text('Enter a valid 10-digit Indian mobile number.'), findsOneWidget);
    expect(seen, isEmpty);
  });

  testWidgets('asking sends +91 and the digits, shows the code step with a resend timer and no demo code', (t) async {
    final seen = <http.Request>[];
    await t.pumpWidget(MaterialApp(home: SignInScreen(services: _services((_) => _json(challenge), seen: seen), showDevSignIn: false)));
    await _type(t, 'phone-field', '98765 43210');
    await _tap(t, 'send-code');
    expect(jsonDecode(seen.single.body), {'phone': '+919876543210', 'platform': 'android'});
    expect(find.byKey(const Key('otp-field')), findsOneWidget);
    expect(find.textContaining('+91 9876543210'), findsOneWidget);
    expect(find.byKey(const Key('demo-code')), findsNothing);
    expect(find.byKey(const Key('resend-timer')), findsOneWidget);
    expect(t.widget<TextButton>(find.byKey(const Key('resend'))).onPressed, isNull);
    // Focus moved to the code field.
    await t.pump();
    expect(t.widget<TextField>(find.byKey(const Key('otp-field'))).focusNode!.hasFocus, isTrue);
    // Let the one-second timer be cancelled by leaving the screen.
    await t.pumpWidget(const SizedBox());
  });

  testWidgets('a demo server code is shown labelled Demo code; resend opens after the countdown', (t) async {
    await t.pumpWidget(MaterialApp(
        home: SignInScreen(
            services: _services((_) => _json({'challenge_id': 'c1', 'expires_in': 300, 'resend_after': 2, 'demo_code': '482913'})),
            showDevSignIn: false)));
    await _type(t, 'phone-field', '9876543210');
    await _tap(t, 'send-code');
    expect(find.text('Demo code: 482913'), findsOneWidget);
    await t.pump(const Duration(seconds: 3));
    expect(find.byKey(const Key('resend-timer')), findsNothing);
    expect(t.widget<TextButton>(find.byKey(const Key('resend'))).onPressed, isNotNull);
    await t.pumpWidget(const SizedBox());
  });

  testWidgets('a wrong code is explained and can retry; the right one goes on and offers a passkey later', (t) async {
    var verifies = 0;
    final services = _services((r) {
      if (r.url.path == '/v1/auth/phone/start') return _json(challenge);
      verifies++;
      return verifies == 1 ? _json({'error': 'invalid_grant'}, 400) : _json(_tokens);
    });
    await t.pumpWidget(MaterialApp(home: SignInScreen(services: services, showDevSignIn: false)));
    await _type(t, 'phone-field', '9876543210');
    await _tap(t, 'send-code');
    await _type(t, 'otp-field', '123456');
    await _tap(t, 'otp-sign-in');
    expect(find.textContaining('isn’t right, or it has expired'), findsOneWidget);
    expect(services.passkeyOfferUntil, isNull);
    await _tap(t, 'otp-sign-in');
    expect(await services.gateway.isSignedIn(), isTrue);
    expect(services.passkeyOfferUntil, isNotNull);
    await t.pumpWidget(const SizedBox());
  });

  testWidgets('an incomplete code is not sent, and a rate limit says how long to wait', (t) async {
    final seen = <http.Request>[];
    var limited = true;
    final services = _services((r) {
      if (limited) return _json({'error': 'too_many_requests'}, 429, {'retry-after': '600'});
      return _json(challenge);
    }, seen: seen);
    await t.pumpWidget(MaterialApp(home: SignInScreen(services: services, showDevSignIn: false)));
    await _type(t, 'phone-field', '9876543210');
    await _tap(t, 'send-code');
    expect(find.textContaining('10 minutes'), findsOneWidget);

    limited = false;
    await _tap(t, 'send-code');
    seen.clear();
    await _type(t, 'otp-field', '123');
    await _tap(t, 'otp-sign-in');
    expect(find.text('Enter the 6-digit code.'), findsOneWidget);
    expect(seen, isEmpty);
    await _tap(t, 'change-number');
    expect(find.byKey(const Key('phone-field')), findsOneWidget);
    await t.pumpWidget(const SizedBox());
  });
}
