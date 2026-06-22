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
        rawDb.execute('SELECT count(*) FROM sqlite_master;');
      },
    );
  });
}
