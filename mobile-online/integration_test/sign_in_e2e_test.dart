// On a device or emulator against the local Aspire gateway:
//   flutter test integration_test --dart-define=KHAZANA_DEV_SIGN_IN=true -d <device>
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:khazana_online/core/config.dart';
import 'package:khazana_online/core/gateway_client.dart';
import 'package:khazana_online/core/key_store.dart';
import 'package:khazana_online/main.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('sign in through the gateway, see home, survive a restart, sign out', (t) async {
    final store = SecureKeyStore();
    await store.clearSession();
    GatewayClient fresh() => GatewayClient(baseUrl: gatewayUrl(), platform: platformName(), store: store);

    await t.pumpWidget(KhazanaOnlineApp(gateway: fresh()));
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField), 'dev:phone-${DateTime.now().millisecondsSinceEpoch}');
    await t.tap(find.text('Sign in'));
    await t.pumpAndSettle(const Duration(seconds: 3));
    expect(find.text('Accounts'), findsOneWidget);
    final status = t.widget<Text>(find.byKey(const Key('device-status'))).data!;
    debugPrint('home: $status');
    expect(status, isNot(contains('could not be reached')));

    // A new client with only the stored refresh token and key: it must refresh.
    await t.pumpWidget(KhazanaOnlineApp(gateway: fresh()));
    await t.pumpAndSettle(const Duration(seconds: 3));
    expect(find.text('Accounts'), findsOneWidget);
    debugPrint('after restart: ${t.widget<Text>(find.byKey(const Key('device-status'))).data}');

    await t.tap(find.text('Sign out'));
    await t.pumpAndSettle(const Duration(seconds: 2));
    expect(find.text('Development sign-in'), findsOneWidget);
    expect(await store.readSession(), isNull);
  });
}
