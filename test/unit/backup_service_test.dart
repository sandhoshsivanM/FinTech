import 'dart:typed_data';

import 'package:fintech_os/core/errors/app_error.dart';
import 'package:fintech_os/features/import/backup_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const svc = BackupService();
  final key = Uint8List.fromList(List.generate(32, (i) => (i * 3) % 256));
  final wrongKey = Uint8List.fromList(List.generate(32, (i) => (i * 5) % 256));
  final iv = Uint8List.fromList(List.generate(12, (i) => i));
  final db = Uint8List.fromList(
      List.generate(5000, (i) => (i * 31 + 7) % 256)); // fake .db bytes

  Future<Uint8List> exportSample({int schema = 1}) => svc.export(
        dbBytes: db,
        key: key,
        schemaVersion: schema,
        appVersion: BackupService.encodeSemver(1, 0, 0),
        timestampMs: 1750000000000,
        iv: iv,
      );

  test('round-trip: export then restore returns bit-identical db', () async {
    final backup = await exportSample();
    final restored = await svc.restore(
      backup: backup,
      key: key,
      currentSchemaVersion: 1,
      currentAppVersion: BackupService.encodeSemver(1, 0, 0),
    );
    expect(restored, equals(db));
  });

  test('header: starts with FTOS magic and ciphertext begins at 0x44', () async {
    final backup = await exportSample();
    expect(backup[0], 0x46); // F
    expect(backup[1], 0x54); // T
    expect(backup[2], 0x4F); // O
    expect(backup[3], 0x53); // S
    // header(68) + ciphertext(5000, GCM is not padded) + tag(16)
    expect(backup.length, BackupService.headerSize + db.length + 16);
  });

  test('wrong key → "Incorrect PIN or corrupted file" (no oracle)', () async {
    final backup = await exportSample();
    expect(
      () => svc.restore(
        backup: backup,
        key: wrongKey,
        currentSchemaVersion: 1,
        currentAppVersion: BackupService.encodeSemver(1, 0, 0),
      ),
      throwsA(isA<BackupError>().having(
          (e) => e.message, 'message', contains('Incorrect PIN'))),
    );
  });

  test('bad magic header → rejected', () async {
    final backup = await exportSample();
    backup[0] = 0x00; // corrupt magic
    expect(
      () => svc.restore(
          backup: backup,
          key: key,
          currentSchemaVersion: 1,
          currentAppVersion: BackupService.encodeSemver(1, 0, 0)),
      throwsA(isA<BackupError>()
          .having((e) => e.message, 'm', contains('not a Khazana backup'))),
    );
  });

  test('newer schema version → abort with update message', () async {
    final backup = await exportSample(schema: 5);
    expect(
      () => svc.restore(
          backup: backup,
          key: key,
          currentSchemaVersion: 1,
          currentAppVersion: BackupService.encodeSemver(1, 0, 0)),
      throwsA(isA<BackupError>()
          .having((e) => e.message, 'm', contains('newer version'))),
    );
  });

  test('older schema version → proceeds (forward migration)', () async {
    final backup = await exportSample(schema: 1);
    final restored = await svc.restore(
      backup: backup,
      key: key,
      currentSchemaVersion: 3, // app is newer than backup
      currentAppVersion: BackupService.encodeSemver(1, 2, 0),
    );
    expect(restored, equals(db));
  });

  test('corrupted ciphertext → tag failure', () async {
    final backup = await exportSample();
    backup[BackupService.headerSize + 10] ^= 0xFF; // flip a ciphertext byte
    expect(
      () => svc.restore(
          backup: backup,
          key: key,
          currentSchemaVersion: 1,
          currentAppVersion: BackupService.encodeSemver(1, 0, 0)),
      throwsA(isA<BackupError>()),
    );
  });

  test('truncated file → rejected', () async {
    final backup = await exportSample();
    final truncated = backup.sublist(0, 40);
    expect(
      () => svc.restore(
          backup: truncated,
          key: key,
          currentSchemaVersion: 1,
          currentAppVersion: BackupService.encodeSemver(1, 0, 0)),
      throwsA(isA<BackupError>()),
    );
  });

  test('semver encode/decode round-trip', () {
    final v = BackupService.encodeSemver(2, 13, 7);
    expect(BackupService.decodeSemver(v), (2, 13, 7));
  });
}
