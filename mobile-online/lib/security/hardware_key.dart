// The hardware-held device key, reached over the `khazana/device_key` platform
// channel. The private key is generated INSIDE Android Keystore (StrongBox when
// present, else the TEE) or the iOS Secure Enclave and never leaves it: Dart
// only ever sees the public key and signatures.

import 'package:flutter/services.dart';

import '../core/dpop.dart';
import 'device_signer.dart';
import 'ecdsa_der.dart';

/// What the platform could create. [none]: no hardware key is possible here
/// (simulator, old device, desktop), so the caller must fall back, visibly.
enum HardwareLevel { strongBox, secureEnclave, tee, none }

abstract class HardwareKeyBackend {
  Future<HardwareLevel> level();

  /// Returns the existing key's public point (0x04||X||Y), or null.
  Future<Uint8List?> publicKey(String alias);

  /// Creates a P-256 signing key; throws [HardwareKeyUnavailable] if the
  /// platform cannot hold it in hardware. Never creates a software key.
  Future<({Uint8List publicKey, HardwareLevel level})> create(String alias);

  /// ECDSA-SHA256 over [message]; DER encoded.
  Future<Uint8List> signDer(String alias, Uint8List message);

  Future<void> delete(String alias);
}

class HardwareKeyUnavailable implements Exception {
  HardwareKeyUnavailable(this.reason);
  final String reason;
  @override
  String toString() => 'HardwareKeyUnavailable($reason)';
}

class ChannelHardwareKeyBackend implements HardwareKeyBackend {
  ChannelHardwareKeyBackend([MethodChannel? channel]) : _c = channel ?? const MethodChannel('khazana/device_key');
  final MethodChannel _c;

  static HardwareLevel parseLevel(String? s) => switch (s) {
        'strongbox' => HardwareLevel.strongBox,
        'secure_enclave' => HardwareLevel.secureEnclave,
        'tee' => HardwareLevel.tee,
        _ => HardwareLevel.none,
      };

  Future<T?> _invoke<T>(String method, [Map<String, Object?>? args]) async {
    try {
      return await _c.invokeMethod<T>(method, args);
    } on MissingPluginException {
      throw HardwareKeyUnavailable('no native implementation on this platform');
    } on PlatformException catch (e) {
      if (e.code == 'unavailable') throw HardwareKeyUnavailable(e.message ?? 'unavailable');
      rethrow;
    }
  }

  @override
  Future<HardwareLevel> level() async {
    try {
      return parseLevel(await _invoke<String>('level'));
    } on HardwareKeyUnavailable {
      return HardwareLevel.none;
    }
  }

  @override
  Future<Uint8List?> publicKey(String alias) async {
    try {
      return await _invoke<Uint8List>('publicKey', {'alias': alias});
    } on HardwareKeyUnavailable {
      return null;
    }
  }

  @override
  Future<({Uint8List publicKey, HardwareLevel level})> create(String alias) async {
    final r = await _invoke<Map<Object?, Object?>>('create', {'alias': alias});
    if (r == null) throw HardwareKeyUnavailable('no result');
    return (publicKey: r['publicKey'] as Uint8List, level: parseLevel(r['level'] as String?));
  }

  @override
  Future<Uint8List> signDer(String alias, Uint8List message) async {
    final r = await _invoke<Uint8List>('sign', {'alias': alias, 'message': message});
    if (r == null) throw HardwareKeyUnavailable('no signature');
    return r;
  }

  @override
  Future<void> delete(String alias) async {
    try {
      await _invoke<void>('delete', {'alias': alias});
    } on HardwareKeyUnavailable {
      // Nothing to delete.
    }
  }
}

class HardwareDeviceSigner extends DeviceSigner {
  HardwareDeviceSigner(this._backend, this.alias, Uint8List publicPoint, this.level)
      : jwk = p256JwkFromUncompressed(publicPoint, base64UrlNoPad);

  final HardwareKeyBackend _backend;
  final String alias;
  final HardwareLevel level;

  @override
  final Map<String, String> jwk;

  @override
  KeyProtection get protection =>
      level == HardwareLevel.tee ? KeyProtection.trustedEnvironment : KeyProtection.hardware;

  @override
  Future<Uint8List> sign(Uint8List message) async => derEcdsaToRaw(await _backend.signDer(alias, message));
}
