import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_online/app_services.dart';
import 'package:khazana_online/core/gateway_client.dart';
import 'package:khazana_online/core/key_store.dart';
import 'package:khazana_online/features/sign_in_screen.dart';
import 'package:khazana_online/sync/record_store.dart';

AppServices _services() {
  final store = MemoryKeyStore();
  return AppServices(
      gateway: GatewayClient(baseUrl: Uri.parse('http://gw.test'), platform: 'android', store: store),
      keyStore: store,
      records: MemoryRecordStore(),
      deviceName: 'Test phone',
      platform: 'android');
}

void main() {
  testWidgets('sign-in points no-account users to the offline app, and hides dev sign-in by default', (t) async {
    await t.pumpWidget(MaterialApp(home: SignInScreen(services: _services(), showDevSignIn: false)));
    expect(find.text('Khazana Online'), findsOneWidget);
    expect(find.textContaining('Use the offline Khazana app'), findsOneWidget);
    expect(find.text('Development sign-in'), findsNothing);
  });

  testWidgets('the development sign-in appears only when the build asks for it', (t) async {
    await t.pumpWidget(MaterialApp(home: SignInScreen(services: _services(), showDevSignIn: true)));
    expect(find.text('Development sign-in', skipOffstage: false), findsOneWidget);
  });
}
