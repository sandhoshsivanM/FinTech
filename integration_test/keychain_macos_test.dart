import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:khazana/core/security/secure_storage.dart';

/// Runs against the REAL platform keychain, so it catches what a unit test
/// cannot: entitlement and signing problems.
///
/// Regression guard for `errSecMissingEntitlement` (-34018), which surfaced on
/// macOS as "Could not create vault: A required entitlement isn't present."
/// The cause was `usesDataProtectionKeychain` defaulting to true, which requires
/// a `keychain-access-groups` entitlement that Xcode will only accept on a build
/// signed with a real Apple development certificate.
///
/// Run with:  flutter test integration_test/keychain_macos_test.dart -d macos
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const key = 'khazana_integration_probe';

  tearDown(() async {
    await appSecureStorage.erase(key: key);
  });

  testWidgets('writes and reads back a secret from the platform keychain',
      (tester) async {
    // This is the exact call that failed with -34018 during vault creation.
    await appSecureStorage.write(key: key, value: 'vault-key-probe');
    expect(await appSecureStorage.read(key: key), 'vault-key-probe');
  });

  testWidgets('overwrites an existing secret', (tester) async {
    await appSecureStorage.write(key: key, value: 'first');
    await appSecureStorage.write(key: key, value: 'second');
    expect(await appSecureStorage.read(key: key), 'second');
  });

  testWidgets('erase destroys the secret', (tester) async {
    await appSecureStorage.write(key: key, value: 'to-be-destroyed');
    await appSecureStorage.erase(key: key);
    // Either genuinely absent, or overwritten to empty — both mean the secret
    // is gone, and nullIfBlank makes readers treat them identically.
    expect(nullIfBlank(await appSecureStorage.read(key: key)), isNull);
  });

  testWidgets('erase does not throw even where platform delete fails',
      (tester) async {
    // Regression guard: a raw delete() raises -34018 on sandboxed macOS because
    // the plugin probes the iCloud keychain. erase() must absorb that.
    await appSecureStorage.write(key: key, value: 'x');
    await expectLater(appSecureStorage.erase(key: key), completes);
  });

  testWidgets('the full vault-secret lifecycle works', (tester) async {
    // Mirrors what creating, unlocking and wiping a vault actually does.
    const salt = 'khazana_probe_salt';
    const exists = 'khazana_probe_exists';

    await appSecureStorage.write(key: salt, value: 'deadbeef');
    await appSecureStorage.write(key: exists, value: '1');

    expect(await appSecureStorage.read(key: salt), 'deadbeef');
    expect(nullIfBlank(await appSecureStorage.read(key: exists)) == '1', isTrue);

    await appSecureStorage.erase(key: salt);
    await appSecureStorage.erase(key: exists);

    expect(nullIfBlank(await appSecureStorage.read(key: salt)), isNull);
    expect(nullIfBlank(await appSecureStorage.read(key: exists)) == '1', isFalse);
  });
}
