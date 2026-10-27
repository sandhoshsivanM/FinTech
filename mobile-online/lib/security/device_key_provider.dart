// Chooses the device signer and migrates off the old software key.
//
// MIGRATION CHOICE (documented trade-off): the refresh token and the access
// token are bound to the key's thumbprint (ADR 0004), so swapping keys under a
// live session would make the server revoke it (key mismatch). We therefore
//   * keep the legacy software key ONLY while a session bound to it exists,
//     reporting it as KeyProtection.software, and
//   * on the next sign-in / pairing (call [rotateForNewSession] before it) mint
//     the hardware key, then erase the software key for good.
// A fresh install never creates a software key unless the platform cannot hold
// a hardware one (then the fallback is flagged, and sensitive actions can be
// refused by policy via [SecurityPolicy.allowSoftwareKey]).
import '../core/dpop.dart';
import 'device_signer.dart';
import 'hardware_key.dart';

/// Access to the legacy software key and the session that is bound to it.
abstract class LegacySoftwareKey {
  Future<String?> read();
  Future<void> write(String exported);
  Future<void> erase();
  Future<bool> hasSession();
}

class HardenedDeviceKeys implements DeviceSignerProvider {
  HardenedDeviceKeys({
    required HardwareKeyBackend hardware,
    required LegacySoftwareKey legacy,
    this.alias = 'khazana.online.device_key.v1',
    this.allowSoftwareFallback = true,
  })  : _hw = hardware,
        _legacy = legacy;

  final HardwareKeyBackend _hw;
  final LegacySoftwareKey _legacy;
  final String alias;

  /// Strict builds (production) may turn the software fallback off: then a
  /// device without hardware support cannot sign in at all (fail closed).
  final bool allowSoftwareFallback;

  DeviceSigner? _cached;

  /// How the current key is protected (null until first use).
  KeyProtection? get protection => _cached?.protection;

  @override
  Future<DeviceSigner> signer() async {
    final cached = _cached;
    if (cached != null) return cached;

    // 1. An existing hardware key always wins.
    final existing = await _hw.publicKey(alias);
    if (existing != null) {
      return _cached = HardwareDeviceSigner(_hw, alias, existing, await _hw.level());
    }

    // 2. A pre-migration software key bound to a live session stays until the
    //    next sign-in, so the session is not killed by a key mismatch.
    final legacy = await _legacy.read();
    if (legacy != null && await _legacy.hasSession()) {
      return _cached = SoftwareDeviceSigner(DeviceKey.restore(legacy));
    }

    // 3. No live session: this device gets a fresh hardware key.
    return _cached = await _mint(eraseLegacy: true, legacyPresent: legacy != null);
  }

  @override
  Future<void> prepareForNewSession() async {
    await rotateForNewSession();
  }

  /// Call before a NEW sign-in or pairing, when no session is live. Replaces a
  /// legacy software key with a hardware key and erases the software key.
  Future<DeviceSigner> rotateForNewSession() async {
    final current = await signer();
    if (current.protection != KeyProtection.software) return current;
    _cached = null;
    return _cached = await _mint(eraseLegacy: true, legacyPresent: true, fresh: true);
  }

  Future<DeviceSigner> _mint({required bool eraseLegacy, required bool legacyPresent, bool fresh = false}) async {
    try {
      final created = await _hw.create(alias);
      if (eraseLegacy && legacyPresent) await _legacy.erase();
      return HardwareDeviceSigner(_hw, alias, created.publicKey, created.level);
    } on HardwareKeyUnavailable {
      if (!allowSoftwareFallback) rethrow;
      // Flagged fallback: reuse the stored software key if one exists.
      final stored = fresh ? null : await _legacy.read();
      if (stored != null) return SoftwareDeviceSigner(DeviceKey.restore(stored));
      final key = DeviceKey.generate();
      await _legacy.write(key.export());
      return SoftwareDeviceSigner(key);
    }
  }
}
