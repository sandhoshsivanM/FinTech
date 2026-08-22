import 'dart:io';
import 'dart:math';

import 'package:decimal/decimal.dart';
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/branding.dart';
import 'package:khazana/core/errors/app_error.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/features/import/backup_service.dart';

/// An export you cannot restore is not a backup, it is a file.
///
/// For a long time that was literally the situation on the Flutter client:
/// Settings offered "Export encrypted backup", `BackupService.restore` existed
/// and was tested at the byte level, and nothing in `lib/` ever called it. The
/// one caller — `verifyBackup` — threw the decrypted database away, and had no
/// callers of its own. A user who reinstalled, or moved to a new phone, lost
/// everything they had ever entered while holding a file that claimed to be
/// their backup.
///
/// These tests exercise the whole loop the way Settings now does it: real
/// database on disk, real export, real bytes, real swap, and then queries
/// against the reopened file. Byte-level codec tests live in
/// `test/unit/backup_service_test.dart`; this one is about the round trip
/// actually closing.
void main() {
  const service = BackupService();
  const vault = 'v1';
  const schemaVersion = 1;

  final appVersion = BackupService.encodeSemver(
    kAppVersionMajor,
    kAppVersionMinor,
    kAppVersionPatch,
  );

  late Directory tmp;
  late Uint8List key;

  Decimal d(String s) => Decimal.parse(s);

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('khazana_restore_');
    final r = Random(7); // deterministic key; this is not the crypto under test
    key = Uint8List.fromList(List.generate(32, (_) => r.nextInt(256)));
  });

  tearDown(() async {
    if (await tmp.exists()) await tmp.delete(recursive: true);
  });

  Uint8List freshIv() {
    final r = Random.secure();
    return Uint8List.fromList(List.generate(12, (_) => r.nextInt(256)));
  }

  /// Builds a database file on disk with one known transaction in it.
  Future<String> seedDatabase({required String merchant}) async {
    final path = '${tmp.path}/vault_$vault.db';
    final db = AppDatabase(NativeDatabase(File(path)));
    final now = DateTime.now().millisecondsSinceEpoch;
    await db.into(db.categories).insert(
        CategoriesCompanion.insert(id: 'c1', vaultId: vault, name: 'Food'));
    await db.into(db.transactions).insert(TransactionsCompanion.insert(
          id: 't1',
          vaultId: vault,
          amount: d('1250.75'),
          type: 'expense',
          categoryId: 'c1',
          date: now,
          createdAt: now,
          merchant: Value(merchant),
        ));
    await db.close();
    return path;
  }

  Future<Uint8List> exportOf(String dbPath) async {
    return service.export(
      dbBytes: await File(dbPath).readAsBytes(),
      key: key,
      schemaVersion: schemaVersion,
      appVersion: appVersion,
      timestampMs: DateTime.now().millisecondsSinceEpoch,
      iv: freshIv(),
    );
  }

  test('an exported backup restores the rows it was taken from', () async {
    final dbPath = await seedDatabase(merchant: 'Blue Tokai');
    final backup = await exportOf(dbPath);

    // Simulate the user carrying on: overwrite the live database with a
    // different one, the way a reinstall or a second device would.
    await File(dbPath).delete();
    final replacement = AppDatabase(NativeDatabase(File(dbPath)));
    await replacement.close();

    // Restore, exactly as SettingsActions.restoreBackup does: decode first,
    // then write the verified bytes over the live file.
    final clear = await service.restore(
      backup: backup,
      key: key,
      currentSchemaVersion: schemaVersion,
      currentAppVersion: appVersion,
    );
    await File(dbPath).writeAsBytes(clear, flush: true);

    final restored = AppDatabase(NativeDatabase(File(dbPath)));
    addTearDown(restored.close);
    final rows = await restored.select(restored.transactions).get();

    expect(rows, hasLength(1));
    expect(rows.single.id, 't1');
    expect(rows.single.merchant, 'Blue Tokai');
    expect(rows.single.amount, d('1250.75'),
        reason: 'money must survive the round trip exactly — it is Decimal, '
            'and a backup that rounds is worse than no backup');
  });

  test('a backup opened with the wrong key is refused, not half-applied',
      () async {
    final dbPath = await seedDatabase(merchant: 'Blue Tokai');
    final backup = await exportOf(dbPath);

    final wrongKey = Uint8List.fromList(List.filled(32, 9));
    await expectLater(
      service.restore(
        backup: backup,
        key: wrongKey,
        currentSchemaVersion: schemaVersion,
        currentAppVersion: appVersion,
      ),
      throwsA(isA<BackupError>()),
    );

    // The live database is untouched: verification happens entirely in memory
    // before anything is written, which is why the UI can safely ask for
    // confirmation only after the file has been checked.
    final db = AppDatabase(NativeDatabase(File(dbPath)));
    addTearDown(db.close);
    expect(await db.select(db.transactions).get(), hasLength(1));
  });

  test('a corrupted backup is refused', () async {
    final dbPath = await seedDatabase(merchant: 'Blue Tokai');
    final backup = await exportOf(dbPath);

    // Flip a byte in the ciphertext.
    final tampered = Uint8List.fromList(backup);
    tampered[BackupService.headerSize + 5] ^= 0xFF;

    await expectLater(
      service.restore(
        backup: tampered,
        key: key,
        currentSchemaVersion: schemaVersion,
        currentAppVersion: appVersion,
      ),
      throwsA(isA<BackupError>()),
    );
  });

  test('a backup from a newer build is refused rather than misread', () async {
    final dbPath = await seedDatabase(merchant: 'Blue Tokai');
    final backup = await service.export(
      dbBytes: await File(dbPath).readAsBytes(),
      key: key,
      schemaVersion: schemaVersion + 1, // written by a future version
      appVersion: appVersion,
      timestampMs: DateTime.now().millisecondsSinceEpoch,
      iv: freshIv(),
    );

    await expectLater(
      service.restore(
        backup: backup,
        key: key,
        currentSchemaVersion: schemaVersion,
        currentAppVersion: appVersion,
      ),
      throwsA(isA<BackupError>()),
    );
  });
}
