import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_online/core/dpop.dart';
import 'package:pointycastle/export.dart';

Map<String, dynamic> _part(String p) => jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(p))))
    as Map<String, dynamic>;

bool _verifies(String proof, DeviceKey key) {
  final parts = proof.split('.');
  final sig = base64Url.decode(base64Url.normalize(parts[2]));
  BigInt big(List<int> b) => b.fold(BigInt.zero, (a, x) => (a << 8) | BigInt.from(x));
  final verifier = ECDSASigner(SHA256Digest())..init(false, PublicKeyParameter<ECPublicKey>(key.publicKey));
  return verifier.verifySignature(
      Uint8List.fromList(ascii.encode('${parts[0]}.${parts[1]}')), ECSignature(big(sig.sublist(0, 32)), big(sig.sublist(32))));
}

void main() {
  test('a proof is an ES256 dpop+jwt carrying only the public key, and verifies', () {
    final key = DeviceKey.generate();
    final proof = key.proof('post', Uri.parse('http://10.0.2.2:5196/v1/auth/token?x=1#y'),
        now: DateTime.fromMillisecondsSinceEpoch(1700000000000));
    final parts = proof.split('.');
    expect(_part(parts[0]), {'typ': 'dpop+jwt', 'alg': 'ES256', 'jwk': key.jwk});
    final payload = _part(parts[1]);
    expect(payload['htm'], 'POST');
    expect(payload['htu'], 'http://10.0.2.2:5196/v1/auth/token');
    expect(payload['iat'], 1700000000);
    expect(payload.containsKey('ath'), isFalse);
    expect(base64Url.decode(base64Url.normalize(parts[2])), hasLength(64), reason: 'raw r||s');
    expect(_verifies(proof, key), isTrue);
  });

  test('with an access token the proof names it (ath)', () {
    final key = DeviceKey.generate();
    final proof = key.proof('GET', Uri.parse('https://api.example/v1/devices/me'), accessToken: 'the-token');
    final expected = base64UrlNoPad(SHA256Digest().process(Uint8List.fromList(ascii.encode('the-token'))));
    expect(_part(proof.split('.')[1])['ath'], expected);
  });

  test('every proof has a fresh jti', () {
    final key = DeviceKey.generate();
    String jti() => _part(key.proof('GET', Uri.parse('https://api.example/x')).split('.')[1])['jti'] as String;
    expect(jti(), isNot(jti()));
  });

  test('a restored key is the same key', () {
    final key = DeviceKey.generate();
    final restored = DeviceKey.restore(key.export());
    expect(restored.jwk, key.jwk);
    expect(restored.thumbprint, key.thumbprint);
    expect(_verifies(restored.proof('GET', Uri.parse('https://api.example/x')), key), isTrue);
  });

  test('the JWK coordinates are 32 bytes and the thumbprint is unpadded SHA-256', () {
    final key = DeviceKey.generate();
    expect(base64Url.decode(base64Url.normalize(key.jwk['x']!)), hasLength(32));
    expect(base64Url.decode(base64Url.normalize(key.jwk['y']!)), hasLength(32));
    expect(key.thumbprint, matches(RegExp(r'^[A-Za-z0-9_-]{43}$')));
  });
}
