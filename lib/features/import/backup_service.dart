import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

import '../../core/errors/app_error.dart';

/// Encrypted backup file codec + 6-check restore validator (PRD §11).
///
/// File layout (all integers big-endian):
///   0x0000  4   magic header 0x46544F53 ("FTOS")
///   0x0004  4   schema version (uint32)
///   0x0008  4   app version (encoded semver)
///   0x000C  8   unix timestamp ms (uint64)
///   0x0014  4   plaintext .db size (uint32)
///   0x0018  32  SHA-256 of the pre-encryption .db
///   0x0038  12  AES-GCM IV (nonce)
///   0x0044  ..  AES-256-GCM ciphertext
///   EOF-16  16  AES-GCM authentication tag
class BackupService {
  const BackupService();

  static const int magic = 0x46544F53; // "FTOS"
  static const int _offSchema = 0x0004;
  static const int _offAppVer = 0x0008;
  static const int _offTimestamp = 0x000C;
  static const int _offPlainSize = 0x0014;
  static const int _offChecksum = 0x0018;
  static const int _offIv = 0x0038;
  static const int headerSize = 0x0044; // ciphertext starts here (68)
  static const int _ivLen = 12;
  static const int _tagLen = 16;
  static const int _checksumLen = 32;

  static final AesGcm _algo = AesGcm.with256bits(nonceLength: _ivLen);

  /// Builds the encrypted backup bytes from the raw .db [dbBytes].
  /// [iv] must be a fresh random 12-byte nonce — never reuse across exports.
  Future<Uint8List> export({
    required Uint8List dbBytes,
    required Uint8List key,
    required int schemaVersion,
    required int appVersion,
    required int timestampMs,
    required Uint8List iv,
  }) async {
    assert(iv.length == _ivLen, 'IV must be 12 bytes');
    final checksum = Uint8List.fromList(
        (await Sha256().hash(dbBytes)).bytes); // SHA-256 of plaintext
    final box = await _algo.encrypt(
      dbBytes,
      secretKey: SecretKey(key),
      nonce: iv,
    );
    final cipher = Uint8List.fromList(box.cipherText);
    final tag = Uint8List.fromList(box.mac.bytes);

    final out = BytesBuilder();
    final head = ByteData(headerSize);
    head.setUint32(0, magic, Endian.big);
    head.setUint32(_offSchema, schemaVersion, Endian.big);
    head.setUint32(_offAppVer, appVersion, Endian.big);
    head.setUint64(_offTimestamp, timestampMs, Endian.big);
    head.setUint32(_offPlainSize, dbBytes.length, Endian.big);
    final headerBytes = head.buffer.asUint8List();
    headerBytes.setRange(_offChecksum, _offChecksum + _checksumLen, checksum);
    headerBytes.setRange(_offIv, _offIv + _ivLen, iv);

    out.add(headerBytes);
    out.add(cipher);
    out.add(tag); // 16-byte tag at EOF
    return out.toBytes();
  }

  /// Validates and decrypts a backup, returning the original .db bytes.
  /// Runs the 6 pre-restore checks (PRD §11B); throws [BackupError] on any
  /// failure. The caller is responsible only for writing the result to disk
  /// (check 6: "write only if all checks pass").
  Future<Uint8List> restore({
    required Uint8List backup,
    required Uint8List key,
    required int currentSchemaVersion,
    required int currentAppVersion,
  }) async {
    // (1) Magic header.
    if (backup.length < headerSize + _tagLen) {
      throw const BackupError('This file is not a Khazana backup.');
    }
    final head = ByteData.sublistView(backup, 0, headerSize);
    if (head.getUint32(0, Endian.big) != magic) {
      throw const BackupError('This file is not a Khazana backup.');
    }

    // (2) Schema version policy.
    final backupSchema = head.getUint32(_offSchema, Endian.big);
    if (backupSchema > currentSchemaVersion) {
      throw const BackupError(
          'This backup was created by a newer version of Khazana. '
          'Please update the app first.');
    }
    // backupSchema < current → proceed; forward migrations run after restore.

    final plainSize = head.getUint32(_offPlainSize, Endian.big);
    final storedChecksum =
        backup.sublist(_offChecksum, _offChecksum + _checksumLen);
    final iv = backup.sublist(_offIv, _offIv + _ivLen);
    final cipher = backup.sublist(headerSize, backup.length - _tagLen);
    final tag = backup.sublist(backup.length - _tagLen);

    // (3)+(4) Decrypt with the PIN-derived key; GCM tag failure is reported
    // without revealing whether it was the key or the data (no PIN oracle).
    final Uint8List clear;
    try {
      final decrypted = await _algo.decrypt(
        SecretBox(cipher, nonce: iv, mac: Mac(tag)),
        secretKey: SecretKey(key),
      );
      clear = Uint8List.fromList(decrypted);
    } on SecretBoxAuthenticationError {
      throw const BackupError('Incorrect PIN or corrupted file.');
    }

    // (5) SHA-256 of decrypted bytes must match the stored checksum.
    final actualChecksum = Uint8List.fromList((await Sha256().hash(clear)).bytes);
    if (clear.length != plainSize ||
        !_constantTimeEquals(actualChecksum, storedChecksum)) {
      throw const BackupError('File may be corrupted. Restore aborted.');
    }

    // (6) All checks passed — return the verified .db bytes for writing.
    return clear;
  }

  /// Encodes a semantic version into a uint32: (major<<16)|(minor<<8)|patch.
  static int encodeSemver(int major, int minor, int patch) =>
      (major << 16) | (minor << 8) | patch;

  static (int, int, int) decodeSemver(int v) =>
      ((v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF);

  static bool _constantTimeEquals(List<int> a, List<int> b) {
    if (a.length != b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a[i] ^ b[i];
    }
    return diff == 0;
  }
}
