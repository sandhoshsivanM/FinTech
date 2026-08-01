import 'package:decimal/decimal.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/constants/default_categories.dart';
import '../../../core/di/data_providers.dart';
import '../../../domain/entities/budget.dart';
import '../../../domain/entities/category.dart';
import '../../../domain/entities/goal.dart';
import '../../../domain/entities/holding.dart';
import '../../../domain/entities/portfolio.dart';
import '../../../domain/entities/liability.dart';
import '../../../domain/entities/recurring_rule.dart';
import '../../../domain/entities/transaction.dart';
import '../../investments/providers/portfolio_providers.dart';

const _uuid = Uuid();

final sampleDataProvider =
    Provider<SampleDataLoader>((ref) => SampleDataLoader(ref));

/// Seeds the active vault with realistic demo data (PRD §14 "seed data option")
/// so every screen is populated for a first look.
class SampleDataLoader {
  SampleDataLoader(this._ref);
  final Ref _ref;

  Decimal _d(String s) => Decimal.parse(s);

  Future<void> load() async {
    final vaultId = _ref.read(currentVaultIdProvider);
    final db = _ref.read(databaseProvider);
    final catRepo = _ref.read(categoryRepositoryProvider);
    final txnRepo = _ref.read(transactionRepositoryProvider);
    // Wait for the bundled classification table before creating instruments:
    // `PortfolioActions` falls back to an empty master, and an instrument
    // created without it keeps a null sector for good, so the demo portfolio
    // would roll up entirely as "Unclassified".
    await _ref.read(instrumentMasterProvider.future);
    final portfolio = _ref.read(portfolioActionsProvider);
    final liabRepo = _ref.read(liabilityRepositoryProvider);
    final budgetRepo = _ref.read(budgetRepositoryProvider);
    final goalRepo = _ref.read(goalRepositoryProvider);
    final recRepo = _ref.read(recurringRepositoryProvider);

    final now = DateTime.now();
    DateTime daysAgo(int n) => now.subtract(Duration(days: n));

    // One transaction → one commit → the DB update stream fires once, so the
    // dashboard rebuilds once instead of ~40 times mid-seed (critical on web).
    await db.transaction(() async {
      // 1. Ensure categories exist, then map name -> id.
      var categories = await catRepo.getAll(vaultId);
      if (categories.isEmpty) {
        for (final c in kDefaultCategories) {
          await catRepo.save(Category(
            id: _uuid.v4(),
            vaultId: vaultId,
            name: c.name,
            iconCodepoint: c.icon.codePoint,
          ));
        }
        categories = await catRepo.getAll(vaultId);
      }
      String cat(String name) => categories
          .firstWhere((c) => c.name == name, orElse: () => categories.first)
          .id;

      Future<void> txn(String amount, TxnType type, String category, int dAgo,
          {String? merchant, String? note}) {
        return txnRepo.save(Txn(
          id: _uuid.v4(),
          vaultId: vaultId,
          amount: _d(amount),
          type: type,
          categoryId: cat(category),
          merchant: merchant,
          note: note ?? 'Sample',
          date: daysAgo(dAgo),
          createdAt: now,
        ));
      }

      // 2. Opening savings + 3 months of salary → healthy net worth.
      await txn('2400000', TxnType.income, 'Salary', 95,
          merchant: 'Opening balance', note: 'Accumulated savings');
      for (final dAgo in [60, 30, 1]) {
        await txn('90000', TxnType.income, 'Salary', dAgo, merchant: 'Employer');
      }

      // 3. Recurring-style expenses across ~3 months.
      for (final dAgo in [62, 32, 2]) {
        await txn('25000', TxnType.expense, 'Rent', dAgo, merchant: 'Landlord');
        await txn('1240', TxnType.expense, 'Utilities', dAgo,
            merchant: 'Electricity');
        await txn('649', TxnType.expense, 'Entertainment', dAgo,
            merchant: 'Netflix');
      }

      // 4. Everyday spending (variety for category breakdown + recent list).
      const spends = <List<dynamic>>[
        ['120', 'Food', 0, 'Coffee'],
        ['450', 'Food', 0, 'Swiggy'],
        ['280', 'Transport', 1, 'Uber'],
        ['1899', 'Shopping', 3, 'Amazon'],
        ['650', 'Food', 4, 'BigBasket'],
        ['320', 'Transport', 6, 'Ola'],
        ['1200', 'Health', 9, 'Pharmacy'],
        ['540', 'Entertainment', 12, 'BookMyShow'],
        ['2300', 'Shopping', 18, 'Myntra'],
        ['760', 'Food', 22, 'Zomato'],
        ['430', 'Transport', 27, 'Fuel'],
        ['980', 'Food', 40, 'Restaurant'],
        ['1500', 'Shopping', 52, 'Decathlon'],
        ['600', 'Health', 70, 'Clinic'],
      ];
      for (final s in spends) {
        await txn(s[0] as String, TxnType.expense, s[1] as String, s[2] as int,
            merchant: s[3] as String);
      }

      // 5. Investments — written to the lot model (instruments + trades +
      //    prices), which is what every screen reads.
      //
      //    This block used to write the legacy `Holdings` table instead. Since
      //    nothing read that table any more, "Load sample data" produced a
      //    vault with a healthy net worth on the Dashboard and a completely
      //    empty Investments screen.
      Future<Instrument> security(
        String name,
        String symbol,
        AssetType kind, {
        String? schemeCode,
        String? amcName,
      }) =>
          portfolio.ensureInstrument(
            name: name,
            kind: kind,
            symbol: schemeCode == null ? symbol : null,
            exchange: schemeCode == null ? 'NSE' : null,
            schemeCode: schemeCode,
            amcName: amcName,
          );

      Future<void> trade(Instrument i, TradeSide side, String qty, String price,
          int dAgo) {
        return portfolio.addTrade(Trade(
          id: _uuid.v4(),
          vaultId: vaultId,
          instrumentId: i.id,
          side: side,
          quantity: _d(qty),
          pricePerUnit: _d(price),
          tradeDate: daysAgo(dAgo),
          brokerage: _d('20'),
          // Sample data is not an import awaiting confirmation. Leaving these
          // unreviewed would light up the review badge on a demo vault, which
          // teaches people to ignore it.
          isReviewed: true,
        ));
      }

      Future<void> price(Instrument i, String p) => portfolio.recordManualPrice(
            instrumentId: i.id,
            price: _d(p),
            asOf: now,
          );

      final niftybees = await security('Nippon India ETF Nifty 50 BeES',
          'NIFTYBEES', AssetType.equityEtf);
      final goldbees =
          await security('Nippon India ETF Gold BeES', 'GOLDBEES', AssetType.goldEtf);
      final reliance =
          await security('Reliance Industries', 'RELIANCE', AssetType.equityEtf);
      final infy = await security('Infosys', 'INFY', AssetType.equityEtf);
      final sbin = await security('State Bank of India', 'SBIN', AssetType.equityEtf);

      // Two mutual funds, with real AMFI scheme codes, so the fund path and the
      // sunburst's non-equity ring have something real to render.
      final parag = await security('Parag Parikh Flexi Cap Fund - Direct Growth',
          '', AssetType.equityMf,
          schemeCode: '122639', amcName: 'PPFAS Mutual Fund');
      final iciciDebt = await security(
          'ICICI Prudential Corporate Bond Fund - Direct Growth', '',
          AssetType.debtMf,
          schemeCode: '120753', amcName: 'ICICI Prudential Mutual Fund');

      await trade(niftybees, TradeSide.buy, '800', '235.10', 400);
      await trade(goldbees, TradeSide.buy, '500', '53.20', 300);
      await trade(reliance, TradeSide.buy, '60', '2250.00', 250);
      await trade(sbin, TradeSide.buy, '200', '560.00', 180);
      await trade(parag, TradeSide.buy, '1500.482', '58.42', 220);
      await trade(iciciDebt, TradeSide.buy, '4200.115', '26.83', 150);

      // Infosys gets two buy lots and a partial sell, so the demo actually
      // exercises FIFO matching, realised P&L, the disposal count and the
      // lot-level detail view — none of which a single-lot holding can show.
      await trade(infy, TradeSide.buy, '120', '1480.00', 500);
      await trade(infy, TradeSide.buy, '80', '1610.00', 210);
      await trade(infy, TradeSide.sell, '50', '1720.00', 45);

      await price(niftybees, '286.40');
      await price(goldbees, '62.80');
      await price(reliance, '2645.00');
      await price(infy, '1695.00');
      await price(sbin, '612.00');
      await price(parag, '71.19');
      await price(iciciDebt, '28.94');

      // 6. Liabilities.
      await liabRepo.save(Liability(
        id: _uuid.v4(),
        vaultId: vaultId,
        name: 'HDFC Credit Card',
        kind: LiabilityKind.creditCard,
        principal: _d('45000'),
        aprPct: _d('42'),
      ));
      await liabRepo.save(Liability(
        id: _uuid.v4(),
        vaultId: vaultId,
        name: 'Personal Loan',
        kind: LiabilityKind.loan,
        principal: _d('230000'),
        aprPct: _d('11.5'),
        termMonths: 36,
      ));

      // 7. Budgets (monthly limits).
      Future<void> budget(String category, String limit) => budgetRepo.save(Budget(
            id: _uuid.v4(),
            vaultId: vaultId,
            categoryId: cat(category),
            amountLimit: _d(limit),
            alertThresholdPct: 90,
          ));
      await budget('Food', '8000');
      await budget('Transport', '3000');
      await budget('Shopping', '5000');
      await budget('Entertainment', '2000');

      // 8. Goals.
      await goalRepo.saveGoal(Goal(
        id: _uuid.v4(),
        vaultId: vaultId,
        name: 'Emergency Fund',
        goalType: GoalType.emergencyFund,
        targetAmount: _d('300000'),
        currentAmount: _d('120000'),
      ));
      await goalRepo.saveGoal(Goal(
        id: _uuid.v4(),
        vaultId: vaultId,
        name: 'Goa Vacation',
        goalType: GoalType.vacation,
        targetAmount: _d('150000'),
        currentAmount: _d('45000'),
        targetDate: now.add(const Duration(days: 200)),
      ));

      // 9. Recurring bills (future-dated → shown as upcoming).
      Future<void> bill(String amount, String category, String merchant, int inDays) =>
          recRepo.save(RecurringRule(
            id: _uuid.v4(),
            vaultId: vaultId,
            amount: _d(amount),
            type: TxnType.expense,
            categoryId: cat(category),
            merchant: merchant,
            frequency: Frequency.monthly,
            nextRun: now.add(Duration(days: inDays)),
          ));
      await bill('45000', 'EMI', 'HDFC Credit Card', 3);
      await bill('649', 'Entertainment', 'Netflix', 5);
      await bill('1240', 'Utilities', 'Electricity Bill', 9);
    });
  }
}
