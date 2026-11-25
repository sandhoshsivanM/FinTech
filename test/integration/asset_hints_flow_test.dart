import 'package:decimal/decimal.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/data/repositories/drift_portfolio_repository.dart';
import 'package:khazana/features/import/lot_csv_parser.dart';
import 'package:khazana/features/investments/providers/portfolio_providers.dart';
import 'package:khazana/features/investments/services/lot_importer.dart';
import 'package:khazana_domain/entities/holding.dart';
import 'package:khazana_domain/entities/portfolio.dart';
import 'package:khazana_domain/services/instrument_master.dart';

/// Gold ETFs filed as equity: import files new ones correctly, never
/// reclassifies an existing one, and the Fix re-files only the type.
void main() {
  late AppDatabase db;
  late DriftPortfolioRepository repo;
  late PortfolioActions actions;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    repo = DriftPortfolioRepository(db.portfolioDao);
    actions = PortfolioActions(repo, 'v1', InstrumentMaster.empty);
  });
  tearDown(() => db.close());

  StagedLot lot(String symbol, int row) => StagedLot(
    side: TradeSide.buy,
    quantity: Decimal.fromInt(10),
    pricePerUnit: Decimal.fromInt(100),
    tradeDate: DateTime(2026, 1, 5),
    rowNumber: row,
    symbol: symbol,
    exchange: 'NSE',
  );

  Future<Instrument> bySymbol(String s) async =>
      (await repo.instruments('v1')).firstWhere((i) => i.symbol == s);

  test('a new GOLDBEES imports as a gold ETF; a stock stays equity', () async {
    await LotImporter(actions).import(
      LotParseResult(
        lots: [lot('GOLDBEES', 2), lot('RELIANCE', 3)],
        rejected: const [],
      ),
      vaultId: 'v1',
    );
    expect((await bySymbol('GOLDBEES')).kind, AssetType.goldEtf);
    expect((await bySymbol('RELIANCE')).kind, AssetType.equityEtf);
  });

  test('a specific import type is kept for every row', () async {
    await LotImporter(actions).import(
      LotParseResult(lots: [lot('GOLDBEES', 2)], rejected: const []),
      vaultId: 'v1',
      defaultKind: AssetType.debtMf,
    );
    expect((await bySymbol('GOLDBEES')).kind, AssetType.debtMf);
  });

  test('an existing instrument keeps its type on re-import', () async {
    await actions.ensureInstrument(
      name: 'GOLDBEES',
      kind: AssetType.equityEtf,
      symbol: 'GOLDBEES',
      exchange: 'NSE',
    );
    await LotImporter(actions).import(
      LotParseResult(lots: [lot('GOLDBEES', 2)], rejected: const []),
      vaultId: 'v1',
    );
    expect((await bySymbol('GOLDBEES')).kind, AssetType.equityEtf);
  });

  test('Fix changes only the type; trades stay attached', () async {
    await actions.ensureInstrument(
      name: 'GOLDBEES',
      kind: AssetType.equityEtf,
      symbol: 'GOLDBEES',
      exchange: 'NSE',
    );
    await LotImporter(actions).import(
      LotParseResult(lots: [lot('GOLDBEES', 2)], rejected: const []),
      vaultId: 'v1',
    );
    final before = await bySymbol('GOLDBEES');
    final trades = await repo.trades('v1');

    await actions.setInstrumentKind(before.id, AssetType.goldEtf);

    final after = await bySymbol('GOLDBEES');
    expect(after.kind, AssetType.goldEtf);
    expect(after.id, before.id);
    expect(after.name, before.name);
    expect((await repo.trades('v1')).length, trades.length);
  });
}
