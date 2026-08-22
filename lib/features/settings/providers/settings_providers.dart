import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../../core/branding.dart';
import '../../../core/di/data_providers.dart';
import '../../../core/di/providers.dart';
import '../../../core/errors/app_error.dart';
import '../../../core/security/vault_state.dart';
import '../../attachments/providers/attachment_providers.dart';
import '../../import/backup_service.dart';

final backupServiceProvider =
    Provider<BackupService>((ref) => const BackupService());

/// Settings actions: encrypted backup export, restore validation, error-log
/// export (PRD §5B, §11). File I/O lives here; the byte/crypto logic is in
/// [BackupService] / [LogService].
final settingsActionsProvider =
    Provider<SettingsActions>((ref) => SettingsActions(ref));

class SettingsActions {
  SettingsActions(this._ref);
  final Ref _ref;

  /// The version stamped into the backup *file header*, and the ceiling
  /// `BackupService.restore` compares an incoming backup against.
  ///
  /// Deliberately NOT `AppDatabase.schemaVersion`, despite an old comment here
  /// claiming it matched — it never has (the DB is on 6). The two version
  /// numbers answer different questions: Drift's is "how do I migrate this
  /// file", this one is "was this backup written by an app newer than me".
  /// Raising it would make every backup written from now on unreadable by any
  /// build still on 1, for no gain, since the restore path already migrates the
  /// database it unpacks.
  static const int _schemaVersion = 1;

  Uint8List get _key {
    final vault = _ref.read(vaultUnlockProvider);
    if (vault is! VaultUnlocked) {
      throw StateError('Vault is locked.');
    }
    return vault.session.key;
  }

  /// Exports an encrypted backup of the vault DB to the documents directory.
  /// Returns the written file path. (PRD §11 export.)
  Future<String> exportBackup({int? timestampMs}) async {
    // Ensure the DB has flushed; reading the file gives a consistent snapshot
    // for SQLCipher's default rollback-journal mode.
    final db = _ref.read(databaseProvider);
    await db.customStatement('PRAGMA wal_checkpoint(FULL);');

    final dbPath = await _ref.read(vaultDbPathProvider.future);
    final dbBytes = await File(dbPath).readAsBytes();

    final iv = _randomBytes(12); // fresh nonce per export (never reused)
    final backup = await _ref.read(backupServiceProvider).export(
          dbBytes: dbBytes,
          key: _key,
          schemaVersion: _schemaVersion,
          appVersion: _appVersion,
          timestampMs: timestampMs ?? DateTime.now().millisecondsSinceEpoch,
          iv: iv,
        );

    final dir = await getApplicationDocumentsDirectory();
    final stamp = timestampMs ?? DateTime.now().millisecondsSinceEpoch;
    final out = p.join(dir.path, 'khazana_backup_$stamp$kBackupExtension');
    await File(out).writeAsBytes(backup, flush: true);
    return out;
  }

  /// Validates a backup file end-to-end (PRD §11B 6 checks) without writing.
  /// Returns null on success, or the failure message.
  Future<String?> verifyBackup(String path) async {
    try {
      await _decodeBackup(path);
      return null;
    } on Exception catch (e) {
      return e is BackupError ? e.message : e.toString();
    }
  }

  /// Replaces the current vault database with the contents of [path].
  ///
  /// This is the other half of [exportBackup], and for a long time it did not
  /// exist: the app could write a `.ftos` file it had no way to read back, so
  /// reinstalling or moving to a new phone lost everything. An export without a
  /// restore is not a backup, it is a file.
  ///
  /// The write is staged so a failure at any point leaves a working vault:
  ///
  ///   1. decode and verify the whole backup in memory first — a bad file is
  ///      rejected before anything on disk is touched;
  ///   2. write the verified bytes to `<db>.restore` alongside the live file;
  ///   3. close the database so no handle holds the old file open;
  ///   4. move the live file aside to `<db>.pre-restore`, then rename the
  ///      staged file into place;
  ///   5. reopen. Drift's migration ladder runs on open, so a backup from an
  ///      older schema is upgraded here rather than by us.
  ///
  /// If step 4 fails halfway the previous database is still at
  /// `<db>.pre-restore` and is moved back. That file is kept on success too,
  /// until the next restore — the one moment a user is most likely to discover
  /// they restored the wrong backup is immediately after doing it.
  ///
  /// Throws [BackupError] with a user-facing message on any validation failure.
  Future<void> restoreBackup(String path) async {
    // (1) Verify before touching disk. Throws on a wrong PIN, a truncated file,
    // a checksum mismatch or a backup from a newer build.
    final dbBytes = await _decodeBackup(path);

    final dbPath = await _ref.read(vaultDbPathProvider.future);
    final staged = File('$dbPath.restore');
    final previous = File('$dbPath.pre-restore');
    final live = File(dbPath);

    // (2) Stage.
    await staged.writeAsBytes(dbBytes, flush: true);

    // (3) Close. Riverpod's onDispose calls db.close(); invalidating and then
    // awaiting the next read guarantees the handle is gone before we rename.
    // SQLCipher's rollback journal and any WAL sidecars belong to the old file
    // and must go with it, or SQLite will try to replay them against the new
    // one and refuse to open it.
    _ref.invalidate(appDatabaseProvider);
    await _deleteIfExists(File('$dbPath-journal'));
    await _deleteIfExists(File('$dbPath-wal'));
    await _deleteIfExists(File('$dbPath-shm'));

    // (4) Swap.
    await _deleteIfExists(previous);
    final hadLive = await live.exists();
    if (hadLive) await live.rename(previous.path);
    try {
      await staged.rename(dbPath);
    } catch (e) {
      // Put it back exactly as we found it.
      if (hadLive && await previous.exists()) {
        await previous.rename(dbPath);
      }
      await _deleteIfExists(staged);
      throw BackupError('Could not replace the vault: $e');
    }

    // (5) Reopen. The migration ladder in AppDatabase runs here if the backup
    // predates the current schema.
    _ref.invalidate(appDatabaseProvider);
    await _ref.read(appDatabaseProvider.future);
  }

  /// Reads, validates and decrypts a backup file without writing anything.
  Future<Uint8List> _decodeBackup(String path) async {
    final file = File(path);
    if (!await file.exists()) {
      throw const BackupError('That backup file no longer exists.');
    }
    final bytes = await file.readAsBytes();
    return _ref.read(backupServiceProvider).restore(
          backup: bytes,
          key: _key,
          currentSchemaVersion: _schemaVersion,
          currentAppVersion: _appVersion,
        );
  }

  static Future<void> _deleteIfExists(File f) async {
    if (await f.exists()) await f.delete();
  }

  static int get _appVersion => BackupService.encodeSemver(
        kAppVersionMajor,
        kAppVersionMinor,
        kAppVersionPatch,
      );

  /// Permanently erases all financial data in the current vault (keeps
  /// categories + the vault itself). PRD §11 reset.
  ///
  /// Receipts live on the filesystem rather than in the database, so erasing
  /// the rows alone left every image on disk — the promise on the confirmation
  /// dialog says "permanently deletes", and for the one kind of record that is
  /// an actual photograph of the user's finances, it did not.
  Future<void> eraseAllData() async {
    await _ref.read(databaseProvider).eraseAllData();
    await _ref.read(attachmentServiceProvider).purgeAll();
  }

  /// Writes the error log to plaintext logs.json (PRD §5B).
  Future<String> exportErrorLog() async {
    final json = await _ref.read(logServiceProvider).exportJson();
    final dir = await getApplicationDocumentsDirectory();
    final out = p.join(dir.path, 'logs.json');
    await File(out).writeAsString(json, flush: true);
    return out;
  }

  static Uint8List _randomBytes(int n) {
    final r = Random.secure();
    return Uint8List.fromList(List.generate(n, (_) => r.nextInt(256)));
  }
}
