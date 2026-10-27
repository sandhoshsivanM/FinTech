// On a device or emulator against the local Aspire gateway:
//   flutter test integration_test --dart-define=KHAZANA_DEV_SIGN_IN=true -d <device>
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:khazana_online/core/config.dart';
import 'package:khazana_online/core/gateway_client.dart';
import 'package:khazana_online/core/key_store.dart';
import 'package:khazana_online/app_services.dart';
import 'package:khazana_online/main.dart';
import 'package:khazana_online/sync/record_store.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('sign in through the gateway, reach key setup, survive a restart', (t) async {
    final store = SecureKeyStore();
    await store.clearSession();
    AppServices fresh() => AppServices(
        gateway: GatewayClient(baseUrl: gatewayUrl(), platform: platformName(), store: store),
        keyStore: store,
        records: MemoryRecordStore());

    await t.pumpWidget(KhazanaOnlineApp(services: fresh()));
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField), 'dev:phone-${DateTime.now().millisecondsSinceEpoch}');
    await t.tap(find.text('Sign in'));
    await t.pumpAndSettle(const Duration(seconds: 3));
    // A brand-new account has no data key yet: the recovery phrase comes first.
    expect(find.text('Your recovery phrase'), findsOneWidget);

    // A new client with only the stored refresh token and key: it must refresh.
    await t.pumpWidget(KhazanaOnlineApp(services: fresh()));
    await t.pumpAndSettle(const Duration(seconds: 3));
    expect(find.text('Your recovery phrase'), findsOneWidget);
    await store.clearSession();
    expect(await store.readSession(), isNull);
  });
}
