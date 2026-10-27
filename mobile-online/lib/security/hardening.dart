// Wires the hardening pieces together from build-time config. main.dart calls
// [Hardening.create] once and passes the parts to the gateway client.
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../core/key_store.dart';
import 'attestation.dart';
import 'device_key_provider.dart';
import 'device_signer.dart';
import 'hardware_key.dart';
import 'integrity.dart';
import 'pinning.dart';

/// Reads the legacy software key and session straight from secure storage
/// (same names as [SecureKeyStore]) so key_store.dart stays untouched.
class SecureStorageLegacyKey implements LegacySoftwareKey {
  SecureStorageLegacyKey(this._store, [FlutterSecureStorage? storage]) : _s = storage ?? const FlutterSecureStorage();
  final KeyStore _store;
  final FlutterSecureStorage _s;
  static const _key = 'khazana_online.device_key';

  @override
  Future<String?> read() => _s.read(key: _key);
  @override
  Future<void> write(String exported) => _s.write(key: _key, value: exported);
  @override
  Future<void> erase() => _s.delete(key: _key);
  @override
  Future<bool> hasSession() async => await _store.readSession() != null;
}

class Hardening {
  Hardening({
    required this.deviceKeys,
    required this.guard,
    required this.httpClient,
    required this.pinning,
    this.attestation = const NoopAttestation(),
  });

  final HardenedDeviceKeys deviceKeys;
  final SensitiveActionGuard guard;
  final http.Client httpClient;
  final PinPolicy pinning;
  final AppAttestation attestation;

  /// Build defines:
  ///   KHAZANA_PIN_HOST, KHAZANA_PINS   production pinning (off when unset)
  ///   KHAZANA_ALLOW_COMPROMISED=true   debug builds only
  ///   KHAZANA_ALLOW_SOFTWARE_KEY=false forbid the software key fallback
  factory Hardening.create({required Uri gateway, required KeyStore store}) {
    const pinHost = String.fromEnvironment('KHAZANA_PIN_HOST');
    const pins = String.fromEnvironment('KHAZANA_PINS');
    const allowCompromised = bool.fromEnvironment('KHAZANA_ALLOW_COMPROMISED');
    const allowSoftware = bool.fromEnvironment('KHAZANA_ALLOW_SOFTWARE_KEY', defaultValue: true);

    final policy = PinPolicy.forGateway(gateway, pinHost: pinHost, pins: pins);
    if (!policy.enforced && kReleaseMode) {
      debugPrint('Khazana: certificate pinning is OFF for ${gateway.host} (no KHAZANA_PIN_HOST match)');
    }
    final keys = HardenedDeviceKeys(
      hardware: ChannelHardwareKeyBackend(),
      legacy: SecureStorageLegacyKey(store),
      allowSoftwareFallback: allowSoftware,
    );
    return Hardening(
      deviceKeys: keys,
      guard: SensitiveActionGuard(
        probe: ChannelIntegrityProbe(),
        policy: SecurityPolicy.fromBuild(allowCompromisedDefine: allowCompromised),
        isSoftwareKey: () => keys.protection == KeyProtection.software,
      ),
      httpClient: pinnedClient(policy),
      pinning: policy,
    );
  }
}
