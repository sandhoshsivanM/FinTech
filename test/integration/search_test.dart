import 'package:decimal/decimal.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/data/repositories/drift_transaction_repository.dart';
import 'package:khazana/domain/entities/transaction.dart';
import 'package:flutter_test/flutter_test.dart';

/// FTS5 search tests (PRD §5/§16). Correctness on host; the ≤100ms/10k perf
/// gate is also asserted here with a generous host bound (true device timing
/// is validated via integration_test on an emulator).
void main() {
  late AppDatabase db;
  late DriftTransactionRepository repo;
  const vault = 'v1';

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    repo = DriftTransactionRepository(db.transactionDao);
    await db.categoryDao.upsert(CategoriesCompanion.insert(
        id: 'food', vaultId: vault, name: 'Food'));
    await db.categoryDao.upsert(CategoriesCompanion.insert(
        id: 'travel', vaultId: vault, name: 'Travel'));
  });

  tearDown(() => db.close());

  Txn t(String id, String cat, String? merchant, String? note) => Txn(
        id: id,
        vaultId: vault,
        amount: Decimal.parse('100'),
        type: TxnType.expense,
        categoryId: cat,
        merchant: merchant,
        note: note,
        date: DateTime(2026, 1, 1),
        createdAt: DateTime(2026, 1, 1),
      );

  test('matches by merchant (prefix)', () async {
    await repo.save(t('1', 'food', 'BigBasket', 'groceries'));
    await repo.save(t('2', 'travel', 'Uber', 'ride'));
    final r = await repo.search(vault, 'big');
    expect(r.map((x) => x.id), ['1']);
  });

  test('matches by note', () async {
    await repo.save(t('1', 'food', 'BigBasket', 'weekly groceries'));
    final r = await repo.search(vault, 'groceries');
    expect(r.single.id, '1');
  });

  test('matches by category name (indexed via trigger subquery)', () async {
    await repo.save(t('1', 'travel', 'Uber', null));
    final r = await repo.search(vault, 'travel');
    expect(r.single.id, '1');
  });

  test('empty query returns nothing', () async {
    await repo.save(t('1', 'food', 'BigBasket', null));
    expect(await repo.search(vault, '   '), isEmpty);
  });

  test('index stays in sync on update and delete', () async {
    await repo.save(t('1', 'food', 'BigBasket', null));
    // update merchant
    final updated = (await repo.getById('1'))!.copyWith(merchant: 'Zomato');
    await repo.save(updated);
    expect(await repo.search(vault, 'bigbasket'), isEmpty);
    expect((await repo.search(vault, 'zomato')).single.id, '1');
    // delete
    await repo.delete('1');
    expect(await repo.search(vault, 'zomato'), isEmpty);
  });

  test('perf: search over 10,000 rows is fast (host smoke bound)', () async {
    await db.batch((b) {
      for (var i = 0; i < 10000; i++) {
        b.insert(
          db.transactions,
          TransactionsCompanion.insert(
            id: 'r$i',
            vaultId: vault,
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
    final sw = Stopwatch()..start();
    final r = await repo.search(vault, 'needlemerchant');
    sw.stop();
    expect(r.single.id, 'r7777');
    // Generous host bound; PRD target is ≤100ms on-device for 10k rows.
    expect(sw.elapsedMilliseconds, lessThan(500));
  });
}
