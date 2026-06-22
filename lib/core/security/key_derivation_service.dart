import 'dart:convert';
import 'dart:isolate';
import 'dart:typed_data';

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

  /// Synchronous derivation. CPU-heavy (~600k iters) — prefer [deriveKeyAsync]
  /// on the UI path so unlock does not jank.
  Uint8List deriveKey({required String pin, required Uint8List salt}) {
    return _pbkdf2(pin, salt);
  }

  /// Runs [deriveKey] in a background isolate (PRD pitfall: KDF off the UI
  /// isolate). [pin] and [salt] are sendable; no plugins touched inside.
  Future<Uint8List> deriveKeyAsync({
    required String pin,
    required Uint8List salt,
  }) {
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
