import 'package:decimal/decimal.dart';
import 'package:drift/native.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/data/repositories/drift_transaction_repository.dart';
import 'package:khazana/domain/entities/transaction.dart';
import 'package:flutter_test/flutter_test.dart';

/// Repository integration tests on an in-memory Drift DB (PRD §4A: drift
/// in-memory, no mocks). The encrypted-SQLCipher round-trip is a device-only
/// integration_test (see integration_test/).
void main() {
  late AppDatabase db;
  late DriftTransactionRepository repo;
  const vault = 'v1';

  Txn make(String id, String amount, TxnType type, DateTime date) => Txn(
        id: id,
        vaultId: vault,
        amount: Decimal.parse(amount),
        type: type,
        categoryId: 'cat1',
        date: date,
        createdAt: date,
      );

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    repo = DriftTransactionRepository(db.transactionDao);
    // FK requires a category to exist.
    await db.categoryDao.upsert(CategoriesCompanion.insert(
      id: 'cat1',
      vaultId: vault,
      name: 'Food',
    ));
  });

  tearDown(() => db.close());

  test('save then getById returns identical Decimal (TEXT round-trip)', () async {
    await repo.save(make('t1', '10000.001', TxnType.expense, DateTime(2026, 1, 1)));
    final got = await repo.getById('t1');
    expect(got, isNotNull);
    expect(got!.amount, Decimal.parse('10000.001'));
    expect(got.amount.toString(), '10000.001'); // no float artifacts
    expect(got.type, TxnType.expense);
  });

  test('getAll returns all rows for a vault, newest first', () async {
    await repo.save(make('t1', '100', TxnType.expense, DateTime(2026, 1, 1)));
    await repo.save(make('t2', '200', TxnType.income, DateTime(2026, 3, 1)));
    final all = await repo.getAll(vault);
    expect(all.length, 2);
    expect(all.first.id, 't2'); // newest first
  });

  test('getInRange filters inclusively by date', () async {
    await repo.save(make('a', '1', TxnType.expense, DateTime(2026, 1, 10)));
    await repo.save(make('b', '1', TxnType.expense, DateTime(2026, 2, 10)));
    await repo.save(make('c', '1', TxnType.expense, DateTime(2026, 3, 10)));
    final inRange = await repo.getInRange(
        vault, DateTime(2026, 2, 1), DateTime(2026, 2, 28));
    expect(inRange.map((t) => t.id), ['b']);
  });

  test('save acts as upsert (update existing id)', () async {
    await repo.save(make('t1', '100', TxnType.expense, DateTime(2026, 1, 1)));
    await repo.save(make('t1', '250', TxnType.income, DateTime(2026, 1, 1)));
    final got = await repo.getById('t1');
    expect(got!.amount, Decimal.parse('250'));
    expect(got.type, TxnType.income);
    expect(await repo.count(vault), 1);
  });

  test('delete removes the row', () async {
    await repo.save(make('t1', '100', TxnType.expense, DateTime(2026, 1, 1)));
    await repo.delete('t1');
    expect(await repo.getById('t1'), isNull);
    expect(await repo.count(vault), 0);
  });

  test('watch emits the current transaction list', () async {
    await repo.save(make('t1', '100', TxnType.expense, DateTime(2026, 1, 1)));
    final first = await repo.watch(vault).first;
    expect(first.length, 1);
    expect(first.first.id, 't1');
  });

  test('accountId and attachmentRef survive the round-trip', () async {
    // Regression: both mappers omitted these two columns, so an attached
    // receipt was encrypted to disk and its pointer silently discarded on
    // save — the file stayed, the reference did not.
    final withRefs = Txn(
      id: 't1',
      vaultId: vault,
      amount: Decimal.parse('120.50'),
      type: TxnType.expense,
      categoryId: 'cat1',
      date: DateTime(2026, 1, 1),
      createdAt: DateTime(2026, 1, 1),
      accountId: 'acct-cash-$vault',
      attachmentRef: 'receipts/9f8e7d6c',
    );
    await repo.save(withRefs);

    final got = await repo.getById('t1');
    expect(got!.accountId, 'acct-cash-$vault');
    expect(got.attachmentRef, 'receipts/9f8e7d6c');

    // And they survive the list paths too, not just getById.
    final all = await repo.getAll(vault);
    expect(all.single.attachmentRef, 'receipts/9f8e7d6c');
    expect(all.single.accountId, 'acct-cash-$vault');
  });

  test('clearing an attachment persists as null rather than being ignored',
      () async {
    await repo.save(Txn(
      id: 't1',
      vaultId: vault,
      amount: Decimal.one,
      type: TxnType.expense,
      categoryId: 'cat1',
      date: DateTime(2026, 1, 1),
      createdAt: DateTime(2026, 1, 1),
      attachmentRef: 'receipts/aaa',
    ));
    await repo.save(make('t1', '1', TxnType.expense, DateTime(2026, 1, 1)));
    expect((await repo.getById('t1'))!.attachmentRef, isNull);
  });

  test('signedAmount: income adds, expense subtracts (PRD §16)', () async {
    await repo.save(make('inc', '500', TxnType.income, DateTime(2026, 1, 1)));
    await repo.save(make('exp', '200', TxnType.expense, DateTime(2026, 1, 2)));
    final all = await repo.getAll(vault);
    final net = all.fold(Decimal.zero, (sum, t) => sum + t.signedAmount);
    expect(net, Decimal.parse('300'));
  });
}
