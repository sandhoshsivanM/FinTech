import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/data/database/encrypted_executor.dart';
import 'package:khazana/data/database/vault_file_probe_io.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Device-only: the recovery path's key check against REAL SQLCipher.
///
/// Recovery decides which salt is the right one by asking the database file,
/// so the check has to be exact (right key yes, wrong key no) and it must
/// never alter the file it is asking — that file may be someone's only copy.
///   flutter test integration_test/vault_recovery_probe_test.dart
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final key = Uint8List.fromList(List.generate(32, (i) => (i * 7) % 256));
  final wrongKey = Uint8List.fromList(List.generate(32, (i) => (i * 9) % 256));
  const vaultId = 'probe_test';
  late String dbPath;

  setUp(() async {
    final dir = await getApplicationDocumentsDirectory();
    dbPath = p.join(dir.path, 'vault_$vaultId.db');
    for (final f in dir.listSync()) {
      if (p.basename(f.path).startsWith('vault_$vaultId.db')) f.deleteSync();
    }
    final db = AppDatabase.encrypted(key: key, path: dbPath);
    await db.categoryDao.upsert(
        CategoriesCompanion.insert(id: 'c1', vaultId: 'v1', name: 'Food'));
    await db.close();
  });

  testWidgets('the right key opens it, the wrong key does not',
      (tester) async {
    expect(await keyOpensDatabase(key, dbPath), isTrue);
    expect(await keyOpensDatabase(wrongKey, dbPath), isFalse);
  });

  testWidgets('asking never changes the file', (tester) async {
    final before = File(dbPath).readAsBytesSync();
    await keyOpensDatabase(wrongKey, dbPath);
    await keyOpensDatabase(key, dbPath);
    expect(File(dbPath).readAsBytesSync(), before);
  });

  testWidgets('the probe finds the file and sets it aside without deleting',
      (tester) async {
    const probe = FileVaultProbe();
    expect(await probe.hasData(vaultId), isTrue);
    final moved = await probe.setAside(vaultId);
    expect(moved, isNotNull);
    expect(File(moved!).existsSync(), isTrue);
    expect(await probe.hasData(vaultId), isFalse);
    // Still the same data, still openable with the original key.
    expect(await keyOpensDatabase(key, moved), isTrue);
  });
}
