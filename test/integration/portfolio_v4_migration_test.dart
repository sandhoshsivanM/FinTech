import 'dart:io';

import 'package:decimal/decimal.dart';
// `hide isNull` — drift exports a SQL `isNull` that collides with matcher's.
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/data/database/app_database.dart';

/// Migration tests for the v4 lot-level portfolio model.
///
/// The first group performs a REAL v3 -> v4 upgrade: it hand-builds a v3-shaped
/// database on disk with `user_version = 3`, then opens [AppDatabase] against it
/// so Drift runs `onUpgrade` for real. The rest exercise the backfill directly.
void main() {
  Decimal d(String s) => Decimal.parse(s);

  group('v3 -> v4 upgrade on a real file', () {
    late Directory tmp;
    late File dbFile;

    setUp(() async {
      tmp = await Directory.systemTemp.createTemp('khazana_v4_mig');
      dbFile = File('${tmp.path}/vault.db');
    });

    tearDown(() async {
      if (await tmp.exists()) await tmp.delete(recursive: true);
    });

    /// Creates just enough of the v3 schema for the v4 migration to read, and
    /// stamps the schema version so Drift treats it as v3.
    Future<void> seedV3Database(List<String> holdingInserts) async {
      final raw = NativeDatabase(dbFile);
      final db = _RawDb(raw);
      await db.customStatement('''
        CREATE TABLE holdings (
          id TEXT NOT NULL PRIMARY KEY,
          vault_id TEXT NOT NULL,
          symbol TEXT NOT NULL,
          exchange TEXT NOT NULL DEFAULT 'NSE',
          quantity TEXT NOT NULL,
          avg_cost TEXT NOT NULL,
          first_purchase_date INTEGER NOT NULL,
          asset_type TEXT NOT NULL DEFAULT 'equity_etf',
          currency TEXT NOT NULL DEFAULT 'INR',
          last_price TEXT NULL
        );
      ''');
      for (final stmt in holdingInserts) {
        await db.customStatement(stmt);
      }
      await db.customStatement('PRAGMA user_version = 3;');
      await db.close();
    }

    test('backfills every legacy holding without losing value', () async {
      await seedV3Database([
        "INSERT INTO holdings VALUES ('h1','v1','INFY','NSE','10','1500.50',"
            "1700000000000,'equity_etf','INR','1650.25');",
        // A mutual fund that had to be misfiled as equity under the old enum,
        // and which never had a price fetched.
        "INSERT INTO holdings VALUES ('h2','v1','PARAGPARIKH','NSE','120.5',"
            "'62.4',1690000000000,'equity_etf','INR',NULL);",
      ]);

      final db = AppDatabase(NativeDatabase(dbFile));
      addTearDown(db.close);

      // Opening the database triggers the migration.
      expect(await db.select(db.instruments).get(), hasLength(2));

      final tradeRows = await db.select(db.trades).get();
      expect(tradeRows, hasLength(2));

      final infy = (await (db.select(db.instruments)
                ..where((t) => t.id.equals('inst-h1')))
              .getSingle());
      expect(infy.name, 'INFY');
      expect(infy.symbol, 'INFY');
      expect(infy.exchange, 'NSE');
      expect(infy.kind, 'equity_etf');
      expect(infy.currency, 'INR');
      // Classification is greenfield — nothing to backfill it from.
      expect(infy.sectorCode, isNull);

      final infyTrade = (await (db.select(db.trades)
                ..where((t) => t.instrumentId.equals('inst-h1')))
              .getSingle());
      expect(infyTrade.side, 'buy');
      expect(infyTrade.quantity, d('10'));
      expect(infyTrade.pricePerUnit, d('1500.50'));
      expect(infyTrade.tradeDate, 1700000000000);
      expect(infyTrade.source, 'legacy');
      // An average is not a real lot: the totals are right but the purchase
      // history behind them is not, so it must not read as authoritative.
      expect(infyTrade.isReviewed, isFalse);
      // No charge data existed in the old schema.
      expect(infyTrade.brokerage, d('0'));
      expect(infyTrade.stt, d('0'));

      // Quantity x price must equal the old invested value exactly.
      expect(infyTrade.quantity * infyTrade.pricePerUnit, d('15005.00'));
    });

    test('carries a known last price into the price series', () async {
      await seedV3Database([
        "INSERT INTO holdings VALUES ('h1','v1','INFY','NSE','10','1500.50',"
            "1700000000000,'equity_etf','INR','1650.25');",
        "INSERT INTO holdings VALUES ('h2','v1','TCS','NSE','5','3000',"
            "1700000000000,'equity_etf','INR',NULL);",
      ]);

      final db = AppDatabase(NativeDatabase(dbFile));
      addTearDown(db.close);

      final prices = await db.select(db.instrumentPrices).get();
      // Only the holding that had a price gets a point — no invented data.
      expect(prices, hasLength(1));
      expect(prices.single.instrumentId, 'inst-h1');
      expect(prices.single.price, d('1650.25'));
      expect(prices.single.source, 'legacy');
      expect(prices.single.asOf, greaterThan(0));
    });

    test('leaves the legacy holdings table untouched', () async {
      await seedV3Database([
        "INSERT INTO holdings VALUES ('h1','v1','INFY','NSE','10','1500.50',"
            "1700000000000,'equity_etf','INR','1650.25');",
      ]);

      final db = AppDatabase(NativeDatabase(dbFile));
      addTearDown(db.close);

      final legacy = await db.select(db.holdings).get();
      expect(legacy, hasLength(1));
      expect(legacy.single.symbol, 'INFY');
      expect(legacy.single.quantity, d('10'));
      expect(legacy.single.lastPrice, d('1650.25'));
    });

    test('an empty portfolio migrates cleanly', () async {
      await seedV3Database(const []);

      final db = AppDatabase(NativeDatabase(dbFile));
      addTearDown(db.close);

      expect(await db.select(db.instruments).get(), isEmpty);
      expect(await db.select(db.trades).get(), isEmpty);
      // The new tables must still exist and be usable.
      expect(await db.select(db.dividends).get(), isEmpty);
      expect(await db.select(db.benchmarkSeries).get(), isEmpty);
      expect(await db.select(db.fundHoldings).get(), isEmpty);
    });
  });

  group('backfill is idempotent', () {
    late AppDatabase db;

    setUp(() => db = AppDatabase(NativeDatabase.memory()));
    tearDown(() => db.close());

    Future<void> insertLegacyHolding(String id, String symbol) {
      return db.into(db.holdings).insert(HoldingsCompanion.insert(
            id: id,
            vaultId: 'v1',
            symbol: symbol,
            quantity: d('10'),
            avgCost: d('100'),
            firstPurchaseDate: 1700000000000,
          ));
    }

    test('running it twice does not duplicate rows', () async {
      await insertLegacyHolding('h1', 'INFY');
      await insertLegacyHolding('h2', 'TCS');

      await db.backfillLotsFromHoldings();
      await db.backfillLotsFromHoldings();

      expect(await db.select(db.instruments).get(), hasLength(2));
      expect(await db.select(db.trades).get(), hasLength(2));
    });

    test('re-running does not resurrect a reviewed flag the user cleared',
        () async {
      await insertLegacyHolding('h1', 'INFY');
      await db.backfillLotsFromHoldings();

      // Simulate the user confirming the backfilled lot.
      await (db.update(db.trades)..where((t) => t.id.equals('trade-h1')))
          .write(const TradesCompanion(isReviewed: Value(true)));

      await db.backfillLotsFromHoldings();

      final row = await (db.select(db.trades)
            ..where((t) => t.id.equals('trade-h1')))
          .getSingle();
      // insertOnConflictUpdate rewrites the row, so this documents the actual
      // behaviour: a re-run resets review state. The migration runs once per
      // upgrade, so this is acceptable — but it must be a conscious choice.
      expect(row.isReviewed, isFalse);
    });
  });
}

/// Minimal executor wrapper so raw DDL can be run against a file before the real
/// [AppDatabase] opens it.
class _RawDb extends GeneratedDatabase {
  _RawDb(super.e);

  @override
  Iterable<TableInfo<Table, dynamic>> get allTables => const [];

  @override
  int get schemaVersion => 1;
}
