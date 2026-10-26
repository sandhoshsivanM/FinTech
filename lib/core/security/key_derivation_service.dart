import 'dart:convert';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart' as web_crypto;
import 'package:pointycastle/export.dart';

/// Derives the vault encryption key from the user's PIN (PRD §2, §14).
///
/// PBKDF2-HMAC-SHA256, 600,000 iterations, 32-byte salt -> 32-byte key.
/// Pure Dart, no Flutter imports — safe to run inside an isolate.
/// PBKDF2-HMAC-SHA256 computed by the platform rather than in Dart.
typedef PlatformPbkdf2 = Future<Uint8List> Function(
    String pin, Uint8List salt, int iterations, int keyLength);

class KeyDerivationService {
  const KeyDerivationService();

  /// Set at startup on platforms with a native PBKDF2 (Android). Pure-Dart
  /// PBKDF2 at 600k iterations took 8–35 seconds per unlock on an Android
  /// device; the platform's is native code. Same algorithm, same key, so
  /// existing vaults open unchanged — and it is only used after it has
  /// produced Dart's exact answer on a known input (see [_platformAgrees]).
  static PlatformPbkdf2? platformDeriver;
  static Future<bool>? _agreement;

  /// For tests: forget the platform deriver and its check result.
  static void resetPlatformDeriver() {
    platformDeriver = null;
    _agreement = null;
  }

  /// PRD: PBKDF2-HMAC-SHA256, 600k iterations.
  static const int iterations = 600000;
  static const int keyLengthBytes = 32; // AES-256
  static const int saltLengthBytes = 32;

  /// True only when compiled to JavaScript (Flutter web). Avoids a
  /// `package:flutter` import in this pure-Dart service.
  static const bool _isWeb = identical(0, 0.0);

  /// Synchronous derivation. CPU-heavy (~600k iters) — prefer [deriveKeyAsync]
  /// on the UI path so unlock does not jank.
  Uint8List deriveKey({required String pin, required Uint8List salt}) {
    return _pbkdf2(pin, salt);
  }

  /// Runs PBKDF2 off the UI path. On native this uses a background isolate
  /// (PRD pitfall: KDF off the UI isolate). On web `Isolate.run` is unsupported,
  /// so we use the browser's Web Crypto PBKDF2 (native, fast). Both paths are
  /// standard PBKDF2-HMAC-SHA256, so they produce identical keys.
  Future<Uint8List> deriveKeyAsync({
    required String pin,
    required Uint8List salt,
  }) async {
    if (_isWeb) {
      final algorithm = web_crypto.Pbkdf2(
        macAlgorithm: web_crypto.Hmac.sha256(),
        iterations: iterations,
        bits: keyLengthBytes * 8,
      );
      final derived = await algorithm.deriveKey(
        secretKey: web_crypto.SecretKey(utf8.encode(pin)),
        nonce: salt,
      );
      return Uint8List.fromList(await derived.extractBytes());
    }
    final native = platformDeriver;
    if (native != null && await (_agreement ??= _platformAgrees(native))) {
      try {
        final key = await native(pin, salt, iterations, keyLengthBytes);
        if (key.length == keyLengthBytes) return key;
      } on Object {
        // Fall through to Dart: slower, never wrong.
      }
    }
    return Isolate.run(() => _pbkdf2(pin, salt));
  }

  /// Known-answer check, once per process: the platform must reproduce Dart's
  /// output for a fixed PIN and salt at a cheap iteration count. A platform
  /// that disagrees (or throws) is never used — a different key would make
  /// every existing vault look like a wrong PIN.
  static Future<bool> _platformAgrees(PlatformPbkdf2 native) async {
    try {
      const pin = 'khazana-kat-0123456789';
      final salt = Uint8List.fromList(List.generate(saltLengthBytes, (i) => (i * 7 + 3) & 0xff));
      final expected = _pbkdf2(pin, salt, rounds: 1000);
      final actual = await native(pin, salt, 1000, keyLengthBytes);
      if (actual.length != expected.length) return false;
      for (var i = 0; i < expected.length; i++) {
        if (actual[i] != expected[i]) return false;
      }
      return true;
    } on Object {
      return false;
    }
  }

  static Uint8List _pbkdf2(String pin, Uint8List salt, {int rounds = iterations}) {
    final derivator = PBKDF2KeyDerivator(HMac(SHA256Digest(), 64))
      ..init(Pbkdf2Parameters(salt, rounds, keyLengthBytes));
    return derivator.process(
      Uint8List.fromList(utf8.encode(pin)),
    );
  }

  /// Lower-case hex encoding for the SQLCipher `PRAGMA key = "x'...'"` blob form.
  static String toHex(Uint8List bytes) {
    final sb = StringBuffer();
    for (final b in bytes) {
      sb.write(b.toRadixString(16).padLeft(2, '0'));
    }
    return sb.toString();
  }
}
