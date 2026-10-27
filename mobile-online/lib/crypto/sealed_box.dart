// libsodium's crypto_box_seal / crypto_box_seal_open (X25519, HSalsa20,
// XSalsa20-Poly1305, Blake2b nonce), built from audited primitives
// (pointycastle's Salsa20, Poly1305 and Blake2b; `cryptography`'s X25519), so
// a Dart client interoperates with libsodium-wrappers in the web client.
// Pinned by contracts/crypto/vectors.json.
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart' as c;
import 'package:pointycastle/export.dart';

import 'bytes.dart';

class KeyError implements Exception {
  KeyError(this.message);
  final String message;
  @override
  String toString() => message;
}

class X25519KeyPair {
  X25519KeyPair(this.publicKey, this.privateKey);
  final Uint8List publicKey;
  final Uint8List privateKey;
}

final _x25519 = c.X25519();

Future<X25519KeyPair> x25519FromSeed(Uint8List seed) async {
  final pair = await _x25519.newKeyPairFromSeed(seed);
  final pub = await pair.extractPublicKey();
  return X25519KeyPair(Uint8List.fromList(pub.bytes), Uint8List.fromList(seed));
}

/// libsodium's crypto_box_seed_keypair: the secret key is SHA-512(seed)[0..32].
/// For test vectors; real device keys are random ([newX25519KeyPair]).
Future<X25519KeyPair> x25519FromBoxSeed(Uint8List seed) =>
    x25519FromSeed(Uint8List.fromList(SHA512Digest().process(seed).sublist(0, 32)));

Future<X25519KeyPair> newX25519KeyPair() => x25519FromSeed(randomBytes(32));

Future<Uint8List> _shared(Uint8List privateKey, Uint8List publicKey) async {
  final pair = await _x25519.newKeyPairFromSeed(privateKey);
  final secret = await _x25519.sharedSecretKey(keyPair: pair, remotePublicKey: c.SimplePublicKey(publicKey, type: c.KeyPairType.x25519));
  return Uint8List.fromList(await secret.extractBytes());
}

int _rotl(int v, int n) => ((v << n) | (v >>> (32 - n))) & 0xffffffff;

int _le32(Uint8List b, int o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);

/// HSalsa20 (key 32, input 16) → 32-byte subkey. The core without the final add.
Uint8List hsalsa20(Uint8List key, Uint8List input) {
  final x = List<int>.filled(16, 0);
  const sigma = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];
  x[0] = sigma[0];
  x[5] = sigma[1];
  x[10] = sigma[2];
  x[15] = sigma[3];
  for (var i = 0; i < 4; i++) {
    x[1 + i] = _le32(key, 4 * i);
    x[11 + i] = _le32(key, 16 + 4 * i);
    x[6 + i] = _le32(input, 4 * i);
  }
  void qr(int a, int b, int c, int d) {
    x[b] ^= _rotl((x[a] + x[d]) & 0xffffffff, 7);
    x[c] ^= _rotl((x[b] + x[a]) & 0xffffffff, 9);
    x[d] ^= _rotl((x[c] + x[b]) & 0xffffffff, 13);
    x[a] ^= _rotl((x[d] + x[c]) & 0xffffffff, 18);
  }

  for (var i = 0; i < 10; i++) {
    qr(0, 4, 8, 12);
    qr(5, 9, 13, 1);
    qr(10, 14, 2, 6);
    qr(15, 3, 7, 11);
    qr(0, 1, 2, 3);
    qr(5, 6, 7, 4);
    qr(10, 11, 8, 9);
    qr(15, 12, 13, 14);
  }
  final out = ByteData(32);
  const idx = [0, 5, 10, 15, 6, 7, 8, 9];
  for (var i = 0; i < 8; i++) {
    out.setUint32(4 * i, x[idx[i]], Endian.little);
  }
  return out.buffer.asUint8List();
}

Uint8List _mac(Uint8List polyKey, Uint8List data) {
  final mac = Poly1305()..init(KeyParameter(polyKey));
  mac.update(data, 0, data.length);
  final out = Uint8List(16);
  mac.doFinal(out, 0);
  return out;
}

Salsa20Engine _stream(Uint8List sharedKey, Uint8List nonce24) {
  final sub = hsalsa20(sharedKey, Uint8List.sublistView(nonce24, 0, 16));
  return Salsa20Engine()..init(true, ParametersWithIV(KeyParameter(sub), Uint8List.sublistView(nonce24, 16, 24)));
}

/// crypto_box_beforenm: HSalsa20(X25519(sk, pk), 0).
Future<Uint8List> _boxKey(Uint8List sk, Uint8List pk) async => hsalsa20(await _shared(sk, pk), Uint8List(16));

Uint8List _sealNonce(Uint8List epk, Uint8List pk) {
  final h = Blake2bDigest(digestSize: 24)
    ..update(epk, 0, 32)
    ..update(pk, 0, 32);
  final out = Uint8List(24);
  h.doFinal(out, 0);
  return out;
}

/// crypto_box_seal. [ephemeralSeed] is for test vectors only.
Future<Uint8List> sealBox(Uint8List message, Uint8List recipientPublicKey, {Uint8List? ephemeralSeed}) async {
  final eph = await x25519FromSeed(ephemeralSeed ?? randomBytes(32));
  final key = await _boxKey(eph.privateKey, recipientPublicKey);
  final stream = _stream(key, _sealNonce(eph.publicKey, recipientPublicKey));
  final polyKey = stream.process(Uint8List(32));
  final ct = stream.process(message);
  return concat([eph.publicKey, _mac(polyKey, ct), ct]);
}

/// crypto_box_seal_open. Throws [KeyError] if it wasn't sealed to [keys].
Future<Uint8List> openSealedBox(Uint8List sealed, X25519KeyPair keys) async {
  const fail = 'This envelope was not sealed to this device.';
  if (sealed.length < 48) throw KeyError(fail);
  final epk = Uint8List.sublistView(sealed, 0, 32);
  final key = await _boxKey(keys.privateKey, Uint8List.fromList(epk));
  final stream = _stream(key, _sealNonce(Uint8List.fromList(epk), keys.publicKey));
  final polyKey = stream.process(Uint8List(32));
  final tag = Uint8List.sublistView(sealed, 32, 48);
  final ct = Uint8List.sublistView(sealed, 48);
  if (!constantTimeEquals(_mac(polyKey, Uint8List.fromList(ct)), tag)) throw KeyError(fail);
  return stream.process(Uint8List.fromList(ct));
}
