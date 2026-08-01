import 'package:decimal/decimal.dart';
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/data/database/app_database.dart';

/// "Erase all data" must actually erase all data.
///
/// It did not. The lot-level portfolio arrived in schema v4 across five tables,
/// and `eraseAllData()` was never taught about any of them — it deleted the
/// legacy `holdings` aggregate and stopped. That was invisible while the UI
/// still read `holdings`, and would have become "erase leaves every holding on
/// screen" the moment the UI moved to the lot model.
///
/// The app promises, in writing, that this button removes your financial data
/// from the device. This test is that promise.
void main() {
  late AppDatabase db;
  const vault = 'v1';

  Decimal d(String s) => Decimal.parse(s);

  setUp(() => db = AppDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  /// Writes one row into every table `eraseAllData` is responsible for.
  Future<void> seedEverything() async {
    final now = DateTime.now().millisecondsSinceEpoch;

    await db.into(db.categories).insert(CategoriesCompanion.insert(
        id: 'c1', vaultId: vault, name: 'Food'));
    await db.into(db.transactions).insert(TransactionsCompanion.insert(
        id: 't1',
        vaultId: vault,
        amount: d('100'),
        type: 'expense',
        categoryId: 'c1',
        date: now,
        createdAt: now));
    await db.into(db.budgets).insert(BudgetsCompanion.insert(
        id: 'b1',
        vaultId: vault,
        categoryId: 'c1',
        amountLimit: d('5000'),
        createdAt: now));
    await db.into(db.holdings).insert(HoldingsCompanion.insert(
        id: 'h1',
        vaultId: vault,
        symbol: 'INFY',
        quantity: d('10'),
        avgCost: d('1500'),
        firstPurchaseDate: now));
    await db.into(db.liabilities).insert(LiabilitiesCompanion.insert(
        id: 'l1',
        vaultId: vault,
        name: 'Card',
        kind: 'credit_card',
        principal: d('20000'),
        aprPct: d('36'),
        createdAt: now));
    await db.into(db.goals).insert(GoalsCompanion.insert(
        id: 'g1',
        vaultId: vault,
        name: 'EF',
        goalType: 'emergency_fund',
        targetAmount: d('600000'),
        currentAmount: d('0'),
        createdAt: now));
    await db.into(db.goalContributions).insert(
        GoalContributionsCompanion.insert(
            id: 'gc1', goalId: 'g1', amount: d('1000'), contributedAt: now));
    await db.into(db.recurringRules).insert(RecurringRulesCompanion.insert(
        id: 'r1',
        vaultId: vault,
        amount: d('999'),
        type: 'expense',
        categoryId: 'c1',
        frequency: 'monthly',
        nextRun: now));
    await db.into(db.insurances).insert(InsurancesCompanion.insert(
        id: 'i1',
        vaultId: vault,
        name: 'Term',
        type: 'term',
        coverAmount: d('10000000'),
        premium: d('12000'),
        renewalDate: Value(now),
        createdAt: now));
    await db.into(db.netWorthSnapshots).insert(
        NetWorthSnapshotsCompanion.insert(
            id: 'snap-1',
            vaultId: vault,
            date: now,
            netWorth: d('1'),
            cash: d('1'),
            investments: d('0'),
            liabilities: d('0')));
    await db.into(db.transactionFingerprints).insert(
        TransactionFingerprintsCompanion.insert(
            vaultId: vault, fingerprint: 'fp1'));
    await db.into(db.accounts).insert(AccountsCompanion.insert(
        id: 'a1',
        vaultId: vault,
        name: 'Bank',
        type: 'asset',
        openingBalance: Value(d('0')),
        createdAt: now));
    await db.into(db.postings).insert(PostingsCompanion.insert(
        id: 'p1',
        vaultId: vault,
        entryId: 't1',
        accountId: 'a1',
        amount: d('100')));
    await db.into(db.pendingCaptures).insert(PendingCapturesCompanion.insert(
        id: 'pc1',
        vaultId: vault,
        amount: d('50'),
        type: 'expense',
        occurredAt: now,
        source: 'sms',
        fingerprint: 'fp2',
        capturedAt: now));

    // The v4 lot-level portfolio — the five tables that used to survive.
    await db.into(db.instruments).insert(InstrumentsCompanion.insert(
        id: 'inst1',
        vaultId: vault,
        kind: 'equity_etf',
        name: 'Infosys',
        createdAt: now));
    await db.into(db.trades).insert(TradesCompanion.insert(
        id: 'tr1',
        vaultId: vault,
        instrumentId: 'inst1',
        side: 'buy',
        quantity: d('10'),
        pricePerUnit: d('1500'),
        tradeDate: now,
        createdAt: now));
    await db.into(db.instrumentPrices).insert(
        InstrumentPricesCompanion.insert(
            id: 'pr1',
            vaultId: vault,
            instrumentId: 'inst1',
            asOf: now,
            price: d('1600'),
            source: 'manual'));
    await db.into(db.dividends).insert(DividendsCompanion.insert(
        id: 'dv1',
        vaultId: vault,
        instrumentId: 'inst1',
        paidOn: now,
        amount: d('250')));
  }

  Future<int> count(TableInfo<Table, dynamic> t) async =>
      (await db.select(t).get()).length;

  test('erases the entire lot-level portfolio, not just legacy holdings',
      () async {
    await seedEverything();

    // Guard the guard: if the seed silently failed, the assertions below would
    // pass against an already-empty database and prove nothing.
    expect(await count(db.instruments), 1);
    expect(await count(db.trades), 1);
    expect(await count(db.instrumentPrices), 1);
    expect(await count(db.dividends), 1);

    await db.eraseAllData();

    expect(await count(db.instruments), 0, reason: 'instruments survived erase');
    expect(await count(db.trades), 0, reason: 'trades survived erase');
    expect(await count(db.instrumentPrices), 0,
        reason: 'prices survived erase — these reveal what you hold');
    expect(await count(db.dividends), 0, reason: 'dividends survived erase');
    expect(await count(db.holdings), 0);
  });

  test('erases every other user-data table', () async {
    await seedEverything();
    await db.eraseAllData();

    expect(await count(db.transactions), 0);
    expect(await count(db.budgets), 0);
    expect(await count(db.liabilities), 0);
    expect(await count(db.goals), 0);
    expect(await count(db.goalContributions), 0);
    expect(await count(db.recurringRules), 0);
    expect(await count(db.insurances), 0);
    expect(await count(db.netWorthSnapshots), 0);
    expect(await count(db.transactionFingerprints), 0);
    expect(await count(db.postings), 0);
    expect(await count(db.pendingCaptures), 0);

    final fts = await db
        .customSelect('SELECT count(*) AS n FROM transactions_fts')
        .getSingle();
    expect(fts.data['n'], 0, reason: 'the search index still holds merchants');
  });

  test('keeps the structural tables so the vault stays usable', () async {
    await seedEverything();
    await db.eraseAllData();

    // Categories and the chart of accounts are scaffolding, not financial
    // history — wiping them would leave an app that cannot record anything.
    expect(await count(db.categories), 1);
    expect(await count(db.accounts), 1);
  });

  test('is idempotent', () async {
    await seedEverything();
    await db.eraseAllData();
    await db.eraseAllData();
    expect(await count(db.instruments), 0);
  });
}
