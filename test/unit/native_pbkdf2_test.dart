// The platform PBKDF2 is only trusted after it reproduces Dart's answer: a
// platform that derived a different key would make every vault look like a
// wrong PIN.
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/security/key_derivation_service.dart';
import 'package:pointycastle/export.dart';

Uint8List _dartPbkdf2(String pin, Uint8List salt, int iterations, int keyLength) =>
    (PBKDF2KeyDerivator(HMac(SHA256Digest(), 64))
          ..init(Pbkdf2Parameters(salt, iterations, keyLength)))
        .process(Uint8List.fromList(pin.codeUnits));

void main() {
  const kdf = KeyDerivationService();
  final salt = Uint8List.fromList(List<int>.generate(32, (i) => i));
  late Uint8List dartKey;

  setUpAll(() => dartKey = kdf.deriveKey(pin: '135792', salt: salt));
  tearDown(KeyDerivationService.resetPlatformDeriver);

  test('a platform that agrees with Dart is used', () async {
    var fullRuns = 0;
    KeyDerivationService.platformDeriver = (pin, s, iterations, len) async {
      if (iterations == KeyDerivationService.iterations) fullRuns++;
      return _dartPbkdf2(pin, s, iterations, len);
    };
    final key = await kdf.deriveKeyAsync(pin: '135792', salt: salt);
    expect(key, dartKey);
    expect(fullRuns, 1, reason: 'the 600k derivation ran on the platform');
  });

  test('a platform that disagrees is never used for the real key', () async {
    var fullRuns = 0;
    KeyDerivationService.platformDeriver = (pin, s, iterations, len) async {
      if (iterations == KeyDerivationService.iterations) fullRuns++;
      return Uint8List(len); // wrong answer
    };
    final key = await kdf.deriveKeyAsync(pin: '135792', salt: salt);
    expect(key, dartKey);
    expect(fullRuns, 0);
  });

  test('a platform that throws falls back to Dart', () async {
    KeyDerivationService.platformDeriver = (pin, s, iterations, len) async =>
        throw StateError('no native crypto');
    expect(await kdf.deriveKeyAsync(pin: '135792', salt: salt), dartKey);
  });
}
