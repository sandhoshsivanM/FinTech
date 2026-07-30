import 'dart:io';
import 'dart:typed_data';

import 'package:decimal/decimal.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;

/// Device-only: exercises the real SQLCipher native path (PRD §4A encryption
/// round-trip, §16 encryption-at-rest). Run with:
///   flutter test integration_test/encryption_roundtrip_test.dart
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final key = Uint8List.fromList(List.generate(32, (i) => (i * 7) % 256));
  final wrongKey = Uint8List.fromList(List.generate(32, (i) => (i * 9) % 256));

  late String dbPath;

  setUp(() async {
    final dir = await getApplicationDocumentsDirectory();
    dbPath = p.join(dir.path, 'roundtrip_test.db');
    final f = File(dbPath);
    if (f.existsSync()) f.deleteSync();
  });

  testWidgets('write → close → reopen with key reads identical data',
      (tester) async {
    var db = AppDatabase.encrypted(key: key, path: dbPath);
    await db.categoryDao.upsert(
        CategoriesCompanion.insert(id: 'c1', vaultId: 'v1', name: 'Food'));
    await db.transactionDao.upsert(TransactionsCompanion.insert(
      id: 't1',
      vaultId: 'v1',
      amount: Decimal.parse('10000.001'),
      type: 'expense',
      categoryId: 'c1',
      date: 1000,
      createdAt: 1000,
    ));
    await db.close();

    db = AppDatabase.encrypted(key: key, path: dbPath);
    final row = await db.transactionDao.findById('t1');
    expect(row, isNotNull);
    expect(row!.amount, Decimal.parse('10000.001'));
    await db.close();
  });

  testWidgets('reopening with the wrong key fails (hard gate)',
      (tester) async {
    var db = AppDatabase.encrypted(key: key, path: dbPath);
    await db.categoryDao.upsert(
        CategoriesCompanion.insert(id: 'c1', vaultId: 'v1', name: 'Food'));
    await db.close();

    final wrong = AppDatabase.encrypted(key: wrongKey, path: dbPath);
    expect(
      () async => wrong.categoryDao.allForVault('v1'),
      throwsA(anything),
    );
  });

  testWidgets('raw file is not readable as plaintext SQLite', (tester) async {
    final db = AppDatabase.encrypted(key: key, path: dbPath);
    await db.categoryDao.upsert(
        CategoriesCompanion.insert(id: 'c1', vaultId: 'v1', name: 'Food'));
    await db.close();

    // A SQLCipher DB does not begin with the "SQLite format 3" magic header.
    final header = File(dbPath).readAsBytesSync().take(16).toList();
    final asString = String.fromCharCodes(header);
    expect(asString.startsWith('SQLite format 3'), isFalse);
  });
}
