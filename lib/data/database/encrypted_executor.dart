import 'dart:ffi';
import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:sqlcipher_flutter_libs/sqlcipher_flutter_libs.dart';
import 'package:sqlite3/open.dart';

import '../../core/security/key_derivation_service.dart';

bool _sqlCipherConfigured = false;

void _configureSqlCipher() {
  if (_sqlCipherConfigured) return;
  _sqlCipherConfigured = true;
  // Use the bundled SQLCipher library, NOT the system SQLite (PRD pitfall:
  // iOS/macOS system-SQLite shadowing → silent plaintext DB).
  open
    ..overrideFor(OperatingSystem.android, openCipherOnAndroid)
    ..overrideFor(OperatingSystem.iOS, DynamicLibrary.process)
    ..overrideFor(OperatingSystem.macOS, DynamicLibrary.process);
}

/// The database exists but this key cannot decrypt it.
///
/// SQLCipher cannot distinguish "wrong key" from "not a database": with the
/// wrong key the header decrypts to noise, and SQLite reports the generic
/// `file is not a database` (code 26). Surfacing that raw string on every
/// screen tells the user their file is corrupt, which is both alarming and
/// wrong — the file is intact, it simply belongs to different credentials.
class VaultKeyMismatchException implements Exception {
  const VaultKeyMismatchException(this.path);

  /// The database that could not be opened. Left untouched.
  final String path;

  @override
  String toString() =>
      'This vault was created with different credentials, so it cannot be '
      'opened with the current PIN. The file has not been modified.';
}

/// Opens an AES-256 SQLCipher database at [path] using [key]. The `PRAGMA key`
/// is the first statement on the connection; a probe query follows so an
/// incorrect key fails fast (PRD §16 encryption-at-rest).
LazyDatabase openEncrypted(Uint8List key, String path) {
  return LazyDatabase(() async {
    _configureSqlCipher();
    await applyWorkaroundToOpenSqlCipherOnOldAndroidVersions();
    final keyHex = KeyDerivationService.toHex(key);
    return NativeDatabase(
      File(path),
      setup: (rawDb) {
        rawDb.execute('PRAGMA key = "x\'$keyHex\'";');
        try {
          rawDb.execute('SELECT count(*) FROM sqlite_master;');
        } on SqliteException catch (e) {
          // 26 is SQLITE_NOTADB. With SQLCipher in play the overwhelmingly
          // likely cause is a key that does not match this file, not actual
          // corruption.
          if (e.resultCode == 26) {
            throw VaultKeyMismatchException(path);
          }
          rethrow;
        }
      },
    );
  });
}
