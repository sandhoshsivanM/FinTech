// End-to-end encryption for Khazana Online (ADR 0005, 0006): the same formats
// as webapp-online/src/lib/crypto/e2e.ts, pinned by contracts/crypto/vectors.json.
//
// - Data key (DEK): 32 random bytes, one per account.
// - Device envelope "x25519-sealedbox-v1": crypto_box_seal of the DEK.
// - Recovery envelope "argon2id-aes256gcm-v1": salt(16) | nonce(12) |
//   AES-256-GCM(DEK) under Argon2id(phrase, salt, ops 3, 64 MiB, 1 lane).
// - Key check: HKDF-SHA256(DEK, no salt, info "khazana.key-check.v1"), 32 bytes.
// - Record: nonce(12) | AES-256-GCM(JSON) with additional data
//   "record_id|collection|key_version".
import 'dart:convert';
import 'dart:typed_data';

import 'package:pointycastle/export.dart';

import 'bytes.dart';
import 'sealed_box.dart';

export 'sealed_box.dart' show KeyError, X25519KeyPair, newX25519KeyPair, x25519FromBoxSeed, x25519FromSeed;

const deviceAlg = 'x25519-sealedbox-v1';
const recoveryAlg = 'argon2id-aes256gcm-v1';
const keyVersion = 1;

const _argonOps = 3;
const _argonMemKib = 64 * 1024;

Uint8List newDek() => randomBytes(32);

Future<Uint8List> sealToDevice(Uint8List dek, Uint8List devicePublicKey) => sealBox(dek, devicePublicKey);

Future<Uint8List> openDeviceEnvelope(Uint8List envelope, X25519KeyPair keys) => openSealedBox(envelope, keys);

Uint8List keyCheck(Uint8List dek) {
  final hkdf = HKDFKeyDerivator(SHA256Digest())
    ..init(HkdfParameters(dek, 32, Uint8List(0), utf8Bytes('khazana.key-check.v1')));
  final out = Uint8List(32);
  hkdf.deriveKey(null, 0, out, 0);
  return out;
}

Uint8List _gcm(bool encrypt, Uint8List key, Uint8List nonce, Uint8List data, Uint8List aad) {
  final cipher = GCMBlockCipher(AESEngine())..init(encrypt, AEADParameters(KeyParameter(key), 128, nonce, aad));
  return cipher.process(data);
}

Uint8List _recoveryKey(List<String> words, Uint8List salt) {
  final argon = Argon2BytesGenerator()
    ..init(Argon2Parameters(Argon2Parameters.ARGON2_id, salt,
        desiredKeyLength: 32, iterations: _argonOps, memory: _argonMemKib, lanes: 1, version: Argon2Parameters.ARGON2_VERSION_13));
  final out = Uint8List(32);
  argon.deriveKey(utf8Bytes(words.join(' ')), 0, out, 0);
  return out;
}

/// The DEK wrapped under the recovery phrase. [salt]/[nonce] are for test vectors only.
Uint8List wrapForRecovery(Uint8List dek, List<String> words, {Uint8List? salt, Uint8List? nonce}) {
  final s = salt ?? randomBytes(16);
  final n = nonce ?? randomBytes(12);
  return concat([s, n, _gcm(true, _recoveryKey(words, s), n, dek, Uint8List(0))]);
}

Uint8List unwrapRecovery(Uint8List blob, List<String> words) {
  try {
    return _gcm(false, _recoveryKey(words, blob.sublist(0, 16)), blob.sublist(16, 28), blob.sublist(28), Uint8List(0));
  } on Object {
    throw KeyError('That recovery phrase doesn’t open this account’s key.');
  }
}

class RecordId {
  const RecordId(this.recordId, this.collection, this.keyVersion);
  final String recordId;
  final String collection;
  final int keyVersion;
  Uint8List get aad => utf8Bytes('$recordId|$collection|$keyVersion');
}

/// [nonce] is for test vectors only. [value] is JSON-encodable.
Uint8List encryptRecord(Uint8List dek, RecordId id, Object? value, {Uint8List? nonce}) {
  final n = nonce ?? randomBytes(12);
  return concat([n, _gcm(true, dek, n, utf8Bytes(jsonEncode(value)), id.aad)]);
}

Object? decryptRecord(Uint8List dek, RecordId id, Uint8List blob) {
  try {
    return jsonDecode(utf8.decode(_gcm(false, dek, blob.sublist(0, 12), blob.sublist(12), id.aad)));
  } on Object {
    throw KeyError('Record ${id.collection}/${id.recordId} could not be decrypted.');
  }
}
