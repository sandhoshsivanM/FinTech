// DPoP (RFC 9449): every request to the gateway carries a proof signed by this
// device's P-256 key, and the access token is bound to that key (cnf.jkt), so
// a stolen token is useless without it.
//
// Scaffold note: the private key lives in the platform keystore through
// flutter_secure_storage (Keychain on Apple, Keystore-encrypted on Android)
// and is loaded into memory to sign. A hardware-held, non-exportable key
// (Secure Enclave / StrongBox) needs platform code and comes with the client
// slice.
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:pointycastle/export.dart';

final _curve = ECDomainParameters('prime256v1');

String base64UrlNoPad(List<int> bytes) => base64Url.encode(bytes).replaceAll('=', '');

Uint8List _fixed32(BigInt value) {
  final out = Uint8List(32);
  var v = value;
  for (var i = 31; i >= 0; i--) {
    out[i] = (v & BigInt.from(0xff)).toInt();
    v = v >> 8;
  }
  return out;
}

BigInt _bigInt(List<int> bytes) => bytes.fold(BigInt.zero, (acc, b) => (acc << 8) | BigInt.from(b));

SecureRandom _random() {
  final seed = Random.secure();
  return FortunaRandom()..seed(KeyParameter(Uint8List.fromList(List.generate(32, (_) => seed.nextInt(256)))));
}

class DeviceKey {
  DeviceKey._(this._private, this.publicKey);

  final ECPrivateKey _private;
  final ECPublicKey publicKey;

  static DeviceKey generate() {
    final generator = ECKeyGenerator()..init(ParametersWithRandom(ECKeyGeneratorParameters(_curve), _random()));
    final pair = generator.generateKeyPair();
    return DeviceKey._(pair.privateKey as ECPrivateKey, pair.publicKey as ECPublicKey);
  }

  /// The private scalar, for the keystore only. Never sent anywhere.
  String export() => base64UrlNoPad(_fixed32(_private.d!));

  static DeviceKey restore(String exported) {
    final d = _bigInt(base64Url.decode(base64Url.normalize(exported)));
    return DeviceKey._(ECPrivateKey(d, _curve), ECPublicKey(_curve.G * d, _curve));
  }

  /// The public key as a JWK (the only key material a proof carries).
  Map<String, String> get jwk => {
        'kty': 'EC',
        'crv': 'P-256',
        'x': base64UrlNoPad(_fixed32(publicKey.Q!.x!.toBigInteger()!)),
        'y': base64UrlNoPad(_fixed32(publicKey.Q!.y!.toBigInteger()!)),
      };

  /// RFC 7638 thumbprint: what the server puts in the token's cnf.jkt.
  String get thumbprint {
    final j = jwk;
    final canonical = '{"crv":"${j['crv']}","kty":"${j['kty']}","x":"${j['x']}","y":"${j['y']}"}';
    return base64UrlNoPad(SHA256Digest().process(Uint8List.fromList(utf8.encode(canonical))));
  }

  /// A proof for one request. [url] is the gateway URL called (the server
  /// ignores query and fragment); [accessToken] is set after sign-in, so the
  /// proof names the token it travels with (ath).
  String proof(String method, Uri url, {String? accessToken, DateTime? now, String? jti}) {
    String part(Object value) => base64UrlNoPad(utf8.encode(jsonEncode(value)));
    final header = {'typ': 'dpop+jwt', 'alg': 'ES256', 'jwk': jwk};
    final payload = <String, Object>{
      'jti': jti ?? _jti(),
      'htm': method.toUpperCase(),
      'htu': '${url.scheme}://${url.authority}${url.path}',
      'iat': (now ?? DateTime.now()).millisecondsSinceEpoch ~/ 1000,
      if (accessToken != null)
        'ath': base64UrlNoPad(SHA256Digest().process(Uint8List.fromList(ascii.encode(accessToken)))),
    };
    final input = '${part(header)}.${part(payload)}';
    return '$input.${base64UrlNoPad(signRaw(Uint8List.fromList(ascii.encode(input))))}';
  }

  /// ES256 over [message]: deterministic ECDSA (RFC 6979, no per-signature
  /// randomness to get wrong), as raw r||s, 32 bytes each (what JWS wants).
  Uint8List signRaw(Uint8List message) {
    final signer = ECDSASigner(SHA256Digest(), HMac(SHA256Digest(), 64))
      ..init(true, PrivateKeyParameter<ECPrivateKey>(_private));
    final sig = signer.generateSignature(message) as ECSignature;
    return Uint8List.fromList([..._fixed32(sig.r), ..._fixed32(sig.s)]);
  }

  static String _jti() {
    final r = Random.secure();
    return base64UrlNoPad(List.generate(16, (_) => r.nextInt(256)));
  }
}
