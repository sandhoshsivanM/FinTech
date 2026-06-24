import 'dart:convert';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart' as web_crypto;
import 'package:pointycastle/export.dart';

/// Derives the vault encryption key from the user's PIN (PRD §2, §14).
///
/// PBKDF2-HMAC-SHA256, 600,000 iterations, 32-byte salt -> 32-byte key.
/// Pure Dart, no Flutter imports — safe to run inside an isolate.
class KeyDerivationService {
  const KeyDerivationService();

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
    return Isolate.run(() => _pbkdf2(pin, salt));
  }

  static Uint8List _pbkdf2(String pin, Uint8List salt) {
    final derivator = PBKDF2KeyDerivator(HMac(SHA256Digest(), 64))
      ..init(Pbkdf2Parameters(salt, iterations, keyLengthBytes));
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
