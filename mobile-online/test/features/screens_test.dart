import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_online/app_services.dart';
import 'package:khazana_online/core/gateway_client.dart';
import 'package:khazana_online/core/key_store.dart';
import 'package:khazana_online/features/recovery_phrase_screen.dart';
import 'package:khazana_online/features/sign_in_screen.dart';
import 'package:khazana_online/sync/record_store.dart';

import '../keys/account_keys_test.dart' show FakeDevices;

AppServices _services(FakeDevices server) {
  final store = MemoryKeyStore();
  final gateway = GatewayClient(baseUrl: Uri.parse('http://gw.test'), platform: 'ios', store: store);
  final s = AppServices(gateway: gateway, keyStore: store, records: MemoryRecordStore(), deviceName: 'Test phone', platform: 'ios');
  return s;
}

void main() {
  testWidgets('sign-in offers a passkey and Google, and disables them when the platform has none', (t) async {
    final s = _services(FakeDevices());
    await t.pumpWidget(MaterialApp(home: SignInScreen(services: s, showDevSignIn: false)));
    expect(find.text('Create account with a passkey'), findsOneWidget);
    expect(find.text('Sign in with a passkey'), findsOneWidget);
    expect(find.text('Continue with Google'), findsOneWidget);
    expect(t.widget<FilledButton>(find.byKey(const Key('passkey-sign-in'))).onPressed, isNotNull);

    await t.pumpWidget(MaterialApp(home: SignInScreen(services: s, showDevSignIn: false, passkeysAvailable: false, googleAvailable: false)));
    expect(t.widget<FilledButton>(find.byKey(const Key('passkey-sign-in'))).onPressed, isNull);
    expect(t.widget<FilledButton>(find.byKey(const Key('google'))).onPressed, isNull);
  });

  testWidgets('recovery phrase: shows 24 words, and Finish stays disabled until three asked words are typed back', (t) async {
    final s = _services(FakeDevices());
    await t.pumpWidget(MaterialApp(home: RecoveryPhraseScreen(services: s, random: Random(1))));
    expect(find.byKey(const Key('recovery-words')), findsOneWidget);
    expect(find.textContaining('24. '), findsOneWidget);
    await t.tap(find.text('I’ve written them down'));
    await t.pump();
    expect(t.widget<FilledButton>(find.byKey(const Key('finish'))).onPressed, isNull);
    // Wrong words keep it disabled.
    for (final f in find.byType(TextField).evaluate()) {
      await t.enterText(find.byWidget(f.widget), 'wrong');
    }
    await t.pump();
    expect(t.widget<FilledButton>(find.byKey(const Key('finish'))).onPressed, isNull);
    // Nothing reached the server.
    expect(await s.records.all(), isEmpty);
  });
}
