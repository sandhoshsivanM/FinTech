import 'package:decimal/decimal.dart';
import 'package:drift/drift.dart';
import 'package:meta/meta.dart';

import '../models/tables.dart';
import 'account_dao.dart';
import 'budget_dao.dart';
import 'category_dao.dart';
import 'converters.dart';
import 'fingerprint_dao.dart';
import 'fx_rate_dao.dart';
import 'goal_dao.dart';
import 'holding_dao.dart';
import 'insurance_dao.dart';
import 'liability_dao.dart';
import 'merchant_alias_dao.dart';
import 'pending_capture_dao.dart';
import 'portfolio_dao.dart';
import 'posting_dao.dart';
import 'recurring_dao.dart';
import 'snapshot_dao.dart';
import 'transaction_dao.dart';
import 'vault_executor.dart';

part 'app_database.g.dart';

/// The encrypted application database (PRD §2: Drift + SQLCipher AES-256).
///
/// The 32-byte vault key is supplied via `PRAGMA key` in the open setup
/// callback — see `openEncrypted`. A probe query immediately follows so an
/// incorrect key fails fast (PRD §16 encryption-at-rest, hard CI gate).
@DriftDatabase(
  tables: [
    Categories,
    Transactions,
    Budgets,
    MerchantAliases,
    Holdings,
    Liabilities,
    Goals,
    GoalContributions,
    RecurringRules,
    FxRates,
    TransactionFingerprints,
    Insurances,
    NetWorthSnapshots,
    Accounts,
    Postings,
    PendingCaptures,
    Instruments,
    Trades,
    InstrumentPrices,
    Dividends,
    FundHoldings,
    BenchmarkSeries,
  ],
  daos: [
    TransactionDao,
    CategoryDao,
    BudgetDao,
    MerchantAliasDao,
    HoldingDao,
    LiabilityDao,
    FingerprintDao,
    FxRateDao,
    GoalDao,
    RecurringDao,
    InsuranceDao,
    SnapshotDao,
    AccountDao,
    PostingDao,
    PendingCaptureDao,
    PortfolioDao,
  ],
)
class AppDatabase extends _$AppDatabase {
  /// General constructor (also used by tests with an in-memory executor).
  AppDatabase(super.e);

  /// Opens (or creates) the encrypted database file at [path] using [key].
  factory AppDatabase.encrypted({
    required Uint8List key,
    required String path,
  }) {
    return AppDatabase(openVaultExecutor(key, path));
  }

  @override
  int get schemaVersion => 4;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) async {
          await m.createAll();
          await _createFtsObjects();
        },
        onUpgrade: (m, from, to) async {
          // v2: insurance policies + daily net-worth snapshots.
          if (from < 2) {
            await m.createTable(insurances);
            await m.createTable(netWorthSnapshots);
          }
          // v3: double-entry accounting + receipt attachments + auto-capture.
          if (from < 3) {
            await _migrateToDoubleEntry(m);
          }
          // v4: lot-level portfolio model (cost basis, prices, sectors).
          if (from < 4) {
            await _migrateToLotLevelPortfolio(m);
          }
        },
      );

  /// v3 migration: adds the chart of accounts + balanced postings and converts
  /// every existing single-entry transaction into a two-leg journal entry, so
  /// net worth is preserved exactly (PRD §16). Deterministic account ids keep
  /// the migration idempotent.
  Future<void> _migrateToDoubleEntry(Migrator m) async {
    await m.createTable(accounts);
    await m.createTable(postings);
    await m.createTable(pendingCaptures);
    await m.addColumn(transactions, transactions.accountId);
    await m.addColumn(transactions, transactions.attachmentRef);

    final now = DateTime.now().millisecondsSinceEpoch;
    final cats = await select(categories).get();
    final txns = await select(transactions).get();
    final vaults = <String>{
      ...cats.map((c) => c.vaultId),
      ...txns.map((t) => t.vaultId),
    };

    String cashId(String v) => 'acct-cash-$v';
    String openingId(String v) => 'acct-opening-$v';
    String incomeId(String v) => 'acct-income-$v';
    String expId(String categoryId) => 'acct-exp-$categoryId';

    await transaction(() async {
      for (final v in vaults) {
        await into(accounts).insertOnConflictUpdate(AccountsCompanion.insert(
          id: cashId(v), vaultId: v, name: 'Cash', type: 'asset',
          subtype: const Value('cash'), createdAt: now,
        ));
        await into(accounts).insertOnConflictUpdate(AccountsCompanion.insert(
          id: openingId(v), vaultId: v, name: 'Opening Balances',
          type: 'equity', subtype: const Value('equity'), createdAt: now,
        ));
        await into(accounts).insertOnConflictUpdate(AccountsCompanion.insert(
          id: incomeId(v), vaultId: v, name: 'Income', type: 'income',
          subtype: const Value('income'), createdAt: now,
        ));
      }
      for (final c in cats) {
        await into(accounts).insertOnConflictUpdate(AccountsCompanion.insert(
          id: expId(c.id), vaultId: c.vaultId, name: c.name, type: 'expense',
          subtype: const Value('expense'), createdAt: now,
        ));
      }
      for (final t in txns) {
        final cash = cashId(t.vaultId);
        final isIncome = t.type == 'income';
        final contra = isIncome ? incomeId(t.vaultId) : expId(t.categoryId);
        final debitAcct = isIncome ? cash : contra;
        final creditAcct = isIncome ? contra : cash;
        await into(postings).insertOnConflictUpdate(PostingsCompanion.insert(
          id: '${t.id}:dr', vaultId: t.vaultId, entryId: t.id,
          accountId: debitAcct, amount: t.amount,
        ));
        await into(postings).insertOnConflictUpdate(PostingsCompanion.insert(
          id: '${t.id}:cr', vaultId: t.vaultId, entryId: t.id,
          accountId: creditAcct, amount: -t.amount,
        ));
        await (update(transactions)..where((x) => x.id.equals(t.id)))
            .write(TransactionsCompanion(accountId: Value(cash)));
      }
    });
  }

  /// v4 migration: introduces the lot-level portfolio model.
  ///
  /// [Holdings] stores one aggregated row per symbol with a single `avgCost`, so
  /// profit-and-loss was not computable — no per-lot cost basis, no
  /// realised/unrealised split, no dated price, no sector to roll up by.
  ///
  /// Every existing holding is backfilled as one [Instruments] row plus one
  /// opening [Trades] buy at its recorded average cost, dated
  /// `firstPurchaseDate`. Those rows carry `isReviewed = false`, because an
  /// average is not a real lot: the quantity and total cost are right, but the
  /// purchase history behind them is not. Flagging beats silently presenting
  /// them as precise. Ids are derived from the holding id, so re-running the
  /// migration cannot duplicate anything.
  ///
  /// [Holdings] is intentionally left in place and untouched — the UI still
  /// reads it until the cutover completes.
  Future<void> _migrateToLotLevelPortfolio(Migrator m) async {
    await m.createTable(instruments);
    await m.createTable(trades);
    await m.createTable(instrumentPrices);
    await m.createTable(dividends);
    await m.createTable(fundHoldings);
    await m.createTable(benchmarkSeries);
    await backfillLotsFromHoldings();
  }

  /// Backfills [Instruments], [Trades] and [InstrumentPrices] from legacy
  /// [Holdings] rows. Split out from the migration so it can be tested directly;
  /// idempotent, so running it twice changes nothing.
  @visibleForTesting
  Future<void> backfillLotsFromHoldings() async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final existing = await select(holdings).get();
    if (existing.isEmpty) return;

    await transaction(() async {
      for (final h in existing) {
        final instrumentId = 'inst-${h.id}';
        await into(instruments).insertOnConflictUpdate(
          InstrumentsCompanion.insert(
            id: instrumentId,
            vaultId: h.vaultId,
            kind: h.assetType,
            name: h.symbol,
            symbol: Value(h.symbol),
            exchange: Value(h.exchange),
            currency: Value(h.currency),
            createdAt: now,
          ),
        );

        await into(trades).insertOnConflictUpdate(
          TradesCompanion.insert(
            id: 'trade-${h.id}',
            vaultId: h.vaultId,
            instrumentId: instrumentId,
            side: 'buy',
            quantity: h.quantity,
            pricePerUnit: h.avgCost,
            tradeDate: h.firstPurchaseDate,
            source: const Value('legacy'),
            isReviewed: const Value(false),
            createdAt: now,
          ),
        );

        // Carry the last known price across as the first point of the series,
        // so nothing that was already displayable stops being displayable.
        // Timestamped `now` because the old schema never recorded when the
        // price was fetched — which is precisely why staleness was unshowable.
        final price = h.lastPrice;
        if (price != null) {
          await into(instrumentPrices).insertOnConflictUpdate(
            InstrumentPricesCompanion.insert(
              id: 'price-${h.id}-legacy',
              vaultId: h.vaultId,
              instrumentId: instrumentId,
              asOf: now,
              price: price,
              source: 'legacy',
            ),
          );
        }
      }
    });
  }

  /// Erase all user financial data (PRD §11 reset). Keeps categories, merchant
  /// aliases, FX rates and the vault itself so the app stays usable — mirrors
  /// the web app's wipe (a clean, empty vault).
  Future<void> eraseAllData() async {
    await transaction(() async {
      await delete(transactions).go();
      await delete(budgets).go();
      await delete(holdings).go();
      await delete(liabilities).go();
      await delete(goalContributions).go();
      await delete(goals).go();
      await delete(recurringRules).go();
      await delete(insurances).go();
      await delete(netWorthSnapshots).go();
      await delete(transactionFingerprints).go();
      // Postings hang off transactions; pending captures are transient drafts.
      // The chart of accounts is structural (like categories) and is kept.
      await delete(postings).go();
      await delete(pendingCaptures).go();
      await customStatement('DELETE FROM transactions_fts');
    });
  }

  /// FTS5 full-text index over transactions (PRD §5/§16 search ≤100ms/10k).
  /// Kept in sync by triggers (never `LIKE '%x%'`). The indexed content is
  /// merchant + note + the joined category name.
  Future<void> _createFtsObjects() async {
    await customStatement(
      "CREATE VIRTUAL TABLE transactions_fts USING fts5("
      "txn_id UNINDEXED, content, tokenize='porter unicode61');",
    );
    const contentExpr =
        "coalesce(new.merchant,'')||' '||coalesce(new.note,'')||' '||"
        "coalesce((SELECT name FROM categories WHERE id = new.category_id),'')";
    await customStatement(
      'CREATE TRIGGER transactions_ai AFTER INSERT ON transactions BEGIN '
      'INSERT INTO transactions_fts(txn_id, content) VALUES (new.id, $contentExpr); END;',
    );
    await customStatement(
      'CREATE TRIGGER transactions_ad AFTER DELETE ON transactions BEGIN '
      'DELETE FROM transactions_fts WHERE txn_id = old.id; END;',
    );
    await customStatement(
      'CREATE TRIGGER transactions_au AFTER UPDATE ON transactions BEGIN '
      'DELETE FROM transactions_fts WHERE txn_id = old.id; '
      'INSERT INTO transactions_fts(txn_id, content) VALUES (new.id, $contentExpr); END;',
    );
  }
}
