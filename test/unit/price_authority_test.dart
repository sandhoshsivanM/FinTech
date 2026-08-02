import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:decimal/decimal.dart';

import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/data/repositories/drift_portfolio_repository.dart';
import 'package:khazana/domain/entities/portfolio.dart';

/// Which of an instrument's recorded prices is "the" current one.
///
/// Newest-`asOf`-wins looks obviously right and is not. `asOf` is the date a
/// price DESCRIBES, not the date it was learned — AMFI publishes a day behind
/// and the app stores that real date on purpose, so a NAV is never presented as
/// fresher than it is. Under a pure date comparison a successful refresh could
/// report "Updated 7" while two mutual funds went on showing demo values,
/// because the sample price carried today's date and the genuine NAV carried
/// yesterday's.
void main() {
  late AppDatabase db;
  late DriftPortfolioRepository repo;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    repo = DriftPortfolioRepository(db.portfolioDao);
  });
  tearDown(() => db.close());

  const vault = 'v1';
  const instrument = 'inst-1';

  Future<void> record({
    required String source,
    required DateTime asOf,
    required String price,
  }) =>
      repo.recordPrice(
        vaultId: vault,
        instrumentId: instrument,
        price: InstrumentPrice(
          instrumentId: instrument,
          asOf: asOf,
          price: Decimal.parse(price),
          source: source,
        ),
      );

  Future<Decimal?> current() async =>
      (await repo.latestPrices(vault))[instrument]?.price;

  final yesterday = DateTime(2026, 7, 31);
  final today = DateTime(2026, 8, 1);

  test('an official NAV beats a newer manual price', () async {
    await record(source: PriceSource.sample.key, asOf: today, price: '71.19');
    await record(source: PriceSource.amfi.key, asOf: yesterday, price: '64.02');
    expect(await current(), Decimal.parse('64.02'),
        reason: 'the fund really is worth its published NAV, not the demo '
            'value that happens to carry a later date');
  });

  test('order of arrival does not change the answer', () async {
    // The same two rows written the other way round must resolve identically,
    // or the result depends on refresh order rather than on the data.
    await record(source: PriceSource.amfi.key, asOf: yesterday, price: '64.02');
    await record(source: PriceSource.sample.key, asOf: today, price: '71.19');
    expect(await current(), Decimal.parse('64.02'));
  });

  test('within one tier the newer price wins', () async {
    await record(
        source: PriceSource.yahoo.key, asOf: yesterday, price: '1100.00');
    await record(source: PriceSource.yahoo.key, asOf: today, price: '1130.10');
    expect(await current(), Decimal.parse('1130.10'));
  });

  test('a live quote beats a cached one', () async {
    await record(source: PriceSource.cache.key, asOf: today, price: '999.00');
    await record(source: PriceSource.yahoo.key, asOf: today, price: '1130.10');
    expect(await current(), Decimal.parse('1130.10'));
  });

  test('a manual price still wins when nothing else has priced it', () async {
    // Bonds, FDs and property have no market to outrank them, which is the
    // whole reason manual entry exists.
    await record(source: PriceSource.manual.key, asOf: today, price: '500.00');
    expect(await current(), Decimal.parse('500.00'));
  });

  test('a legacy price, whose date is fiction, loses to anything real',
      () async {
    // The v4 backfill stamped its own run time as `asOf`, so a legacy row can
    // carry an arbitrarily recent date that describes nothing.
    await record(
        source: PriceSource.legacy.key, asOf: today, price: '888.00');
    await record(
        source: PriceSource.manual.key, asOf: yesterday, price: '500.00');
    expect(await current(), Decimal.parse('500.00'));
  });

  test('an unrecognised source degrades instead of throwing', () async {
    // A row written by a newer build must not crash an older one, and ranking
    // it lowest is the safe direction.
    await record(source: 'some-future-provider', asOf: today, price: '1.00');
    await record(source: PriceSource.manual.key, asOf: yesterday, price: '2.00');
    expect(await current(), Decimal.parse('2.00'));
  });
}
