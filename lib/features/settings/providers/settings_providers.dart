import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../../core/di/data_providers.dart';
import '../../../core/di/providers.dart';
import '../../../core/security/vault_state.dart';
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

  static const int _schemaVersion = 1; // matches AppDatabase.schemaVersion

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
          appVersion: BackupService.encodeSemver(1, 0, 0),
          timestampMs: timestampMs ?? DateTime.now().millisecondsSinceEpoch,
          iv: iv,
        );

    final dir = await getApplicationDocumentsDirectory();
    final stamp = timestampMs ?? DateTime.now().millisecondsSinceEpoch;
    final out = p.join(dir.path, 'fintech_backup_$stamp.ftos');
    await File(out).writeAsBytes(backup, flush: true);
    return out;
  }

  /// Validates a backup file end-to-end (PRD §11B 6 checks) without writing.
  /// Returns null on success, or the failure message.
  Future<String?> verifyBackup(String path) async {
    try {
      final bytes = await File(path).readAsBytes();
      await _ref.read(backupServiceProvider).restore(
            backup: bytes,
            key: _key,
            currentSchemaVersion: _schemaVersion,
            currentAppVersion: BackupService.encodeSemver(1, 0, 0),
          );
      return null;
    } on Exception catch (e) {
      return e.toString();
    }
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
