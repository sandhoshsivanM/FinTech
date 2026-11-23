import 'package:decimal/decimal.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/data/repositories/drift_portfolio_repository.dart';
import 'package:khazana/data/repositories/drift_sip_repository.dart';
import 'package:khazana_domain/entities/asset_group.dart';
import 'package:khazana_domain/entities/holding.dart';
import 'package:khazana_domain/entities/portfolio.dart';
import 'package:khazana_domain/entities/sip.dart';

void main() {
  late AppDatabase db;
  late DriftSipRepository sips;
  late DriftPortfolioRepository portfolio;

  final plan = SipPlan(
    id: 's1',
    vaultId: 'v1',
    instrumentId: 'i1',
    name: 'Parag Parikh Flexi Cap',
    assetType: AssetType.equityMf,
    amount: Decimal.parse('8000'),
    dayOfMonth: 23,
    startDate: const CalendarDate(2026, 1, 23),
  );
  const due = CalendarDate(2026, 11, 23);

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    sips = DriftSipRepository(db.sipDao);
    portfolio = DriftPortfolioRepository(db.portfolioDao);
    await portfolio.saveInstrument(const Instrument(
        id: 'i1', vaultId: 'v1', kind: AssetType.equityMf, name: 'PPFAS'));
    await sips.savePlan(plan);
  });
  tearDown(() => db.close());

  test('a plan round-trips with its calendar dates intact', () async {
    final got = (await sips.plans('v1')).single;
    expect(got.startDate, plan.startDate);
    expect(got.amount, plan.amount);
    expect(got.assetType, AssetType.equityMf);
    expect(got.active, isTrue);
  });

  test('Mark done records a reviewed buy and its instalment; Undo removes both',
      () async {
    final i = await sips.markDone(
      plan: plan,
      dueDate: due,
      amount: Decimal.parse('8000'),
      nav: Decimal.parse('74.3109'),
      instalmentId: 'n1',
      tradeId: 't1',
    );
    expect(i.units, Decimal.parse('107.656'));

    final trade = (await portfolio.trades('v1')).single;
    expect(trade.id, 't1');
    expect(trade.instrumentId, 'i1');
    expect(trade.side, TradeSide.buy);
    expect(trade.quantity, Decimal.parse('107.656'));
    expect(trade.pricePerUnit, Decimal.parse('74.3109'));
    expect(trade.isReviewed, isTrue);
    expect(trade.tradeDate, DateTime(2026, 11, 23));
    expect((await sips.instalments('v1')).single.tradeId, 't1');

    await sips.undo('n1');
    expect(await portfolio.trades('v1'), isEmpty);
    expect(await sips.instalments('v1'), isEmpty);
  });

  test('Skipped records an answer with no money and no trade', () async {
    await sips.markSkipped(plan: plan, dueDate: due, instalmentId: 'n2');
    final i = (await sips.instalments('v1')).single;
    expect(i.status, SipInstalmentStatus.skipped);
    expect(i.amount, Decimal.zero);
    expect(await portfolio.trades('v1'), isEmpty);
  });

  test('a second answer for the same date is refused, leaving no stray trade',
      () async {
    await sips.markDone(
        plan: plan,
        dueDate: due,
        amount: Decimal.parse('8000'),
        nav: Decimal.parse('100'),
        instalmentId: 'n1',
        tradeId: 't1');
    await expectLater(
      sips.markDone(
          plan: plan,
          dueDate: due,
          amount: Decimal.parse('8000'),
          nav: Decimal.parse('100'),
          instalmentId: 'n2',
          tradeId: 't2'),
      throwsA(anything),
    );
    expect((await portfolio.trades('v1')).map((t) => t.id), ['t1'],
        reason: 'the transaction must roll the second trade back');
  });

  test('targets save only as a complete set of 100', () async {
    await sips.saveTargets(
        'v1', {AssetGroup.equity: 60, AssetGroup.debt: 40, AssetGroup.gold: 0});
    expect(await sips.targets('v1'),
        {AssetGroup.equity: 60, AssetGroup.debt: 40});
    expect(() => sips.saveTargets('v1', {AssetGroup.equity: 90}),
        throwsArgumentError);
    await sips.saveTargets('v1', {AssetGroup.equity: 100});
    expect(await sips.targets('v1'), {AssetGroup.equity: 100},
        reason: 'a save replaces the whole set');
  });

  test('deleting the instrument removes its SIPs too', () async {
    await sips.markSkipped(plan: plan, dueDate: due, instalmentId: 'n2');
    await portfolio.deleteInstrument('i1');
    expect(await sips.plans('v1'), isEmpty);
    expect(await sips.instalments('v1'), isEmpty);
  });

  test('erase all data clears SIPs and targets', () async {
    await sips.saveTargets('v1', {AssetGroup.equity: 100});
    await sips.markSkipped(plan: plan, dueDate: due, instalmentId: 'n2');
    await db.eraseAllData();
    expect(await sips.plans('v1'), isEmpty);
    expect(await sips.instalments('v1'), isEmpty);
    expect(await sips.targets('v1'), isEmpty);
  });
}
