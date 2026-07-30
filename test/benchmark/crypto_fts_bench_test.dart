@Tags(['benchmark'])
library;

import 'dart:typed_data';

import 'package:decimal/decimal.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:khazana/core/security/key_derivation_service.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/data/repositories/drift_transaction_repository.dart';
import 'package:flutter_test/flutter_test.dart';

/// Benchmarks that print measured numbers for the architecture doc. Not strict
/// gates — the existing unit/integration suites assert correctness and loose
/// perf bounds. Run just these with:
///   flutter test test/benchmark/crypto_fts_bench_test.dart
void main() {
  test('PBKDF2-HMAC-SHA256 600k derivation time (pure Dart / pointycastle)', () {
    const svc = KeyDerivationService();
    final salt = Uint8List.fromList(List<int>.generate(32, (i) => i));
    const runs = 3;
    final samples = <int>[];
    for (var i = 0; i < runs; i++) {
      final sw = Stopwatch()..start();
      svc.deriveKey(pin: 'correct horse battery staple', salt: salt);
      sw.stop();
      samples.add(sw.elapsedMicroseconds);
    }
    final meanMs =
        samples.reduce((a, b) => a + b) / samples.length / 1000.0;
    // ignore: avoid_print
    print('PBKDF2 600k → 32-byte key: mean ${meanMs.toStringAsFixed(1)} ms '
        'over $runs runs (native; web uses Web Crypto and is faster).');
    expect(meanMs, greaterThan(0));
  });

  test('FTS5 search latency over 10,000 transactions', () async {
    final db = AppDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    final repo = DriftTransactionRepository(db.transactionDao);
    await db.categoryDao.upsert(
        CategoriesCompanion.insert(id: 'food', vaultId: 'v', name: 'Food'));

    await db.batch((b) {
      for (var i = 0; i < 10000; i++) {
        b.insert(
          db.transactions,
          TransactionsCompanion.insert(
            id: 'r$i',
            vaultId: 'v',
            amount: Decimal.parse('100'),
            type: 'expense',
            categoryId: 'food',
            merchant: Value(i == 7777 ? 'NeedleMerchant' : 'Haystack$i'),
            date: 1000 + i,
            createdAt: 1000 + i,
          ),
        );
      }
    });

    // Warm + measured runs.
    await repo.search('v', 'needlemerchant');
    const runs = 5;
    final samples = <int>[];
    for (var i = 0; i < runs; i++) {
      final sw = Stopwatch()..start();
      final r = await repo.search('v', 'needlemerchant');
      sw.stop();
      expect(r.single.id, 'r7777');
      samples.add(sw.elapsedMicroseconds);
    }
    final meanMs =
        samples.reduce((a, b) => a + b) / samples.length / 1000.0;
    // ignore: avoid_print
    print('FTS5 search over 10k rows: mean ${meanMs.toStringAsFixed(2)} ms '
        'over $runs runs (host; PRD on-device target ≤100 ms).');
    expect(meanMs, lessThan(500));
  });
}
