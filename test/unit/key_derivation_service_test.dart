import 'dart:typed_data';

import 'package:khazana/core/security/key_derivation_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const kdf = KeyDerivationService();
  final salt = Uint8List.fromList(List<int>.generate(32, (i) => i));

  test('derives a 32-byte (AES-256) key', () {
    final key = kdf.deriveKey(pin: '1234', salt: salt);
    expect(key.length, KeyDerivationService.keyLengthBytes);
    expect(key.length, 32);
  });

  test('is deterministic for the same pin + salt', () {
    final a = kdf.deriveKey(pin: '1234', salt: salt);
    final b = kdf.deriveKey(pin: '1234', salt: salt);
    expect(a, equals(b));
  });

  test('different PIN yields a different key', () {
    final a = kdf.deriveKey(pin: '1234', salt: salt);
    final b = kdf.deriveKey(pin: '4321', salt: salt);
    expect(a, isNot(equals(b)));
  });

  test('different salt yields a different key', () {
    final otherSalt = Uint8List.fromList(List<int>.generate(32, (i) => 31 - i));
    final a = kdf.deriveKey(pin: '1234', salt: salt);
    final b = kdf.deriveKey(pin: '1234', salt: otherSalt);
    expect(a, isNot(equals(b)));
  });

  test('uses 600,000 iterations (PRD §2)', () {
    expect(KeyDerivationService.iterations, 600000);
  });

  test('toHex round-trips to 64 lowercase hex chars', () {
    final key = kdf.deriveKey(pin: '1234', salt: salt);
    final hex = KeyDerivationService.toHex(key);
    expect(hex.length, 64);
    expect(RegExp(r'^[0-9a-f]+$').hasMatch(hex), isTrue);
  });
}
