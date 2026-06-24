import 'package:decimal/decimal.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/constants/default_categories.dart';
import '../../../core/di/data_providers.dart';
import '../../../domain/entities/budget.dart';
import '../../../domain/entities/category.dart';
import '../../../domain/entities/goal.dart';
import '../../../domain/entities/holding.dart';
import '../../../domain/entities/liability.dart';
import '../../../domain/entities/recurring_rule.dart';
import '../../../domain/entities/transaction.dart';

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
    final holdRepo = _ref.read(holdingRepositoryProvider);
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

      // 5. Holdings (investments).
      Future<void> hold(String sym, String qty, String avg, String last,
          AssetType type, int dAgo) {
        return holdRepo.save(Holding(
          id: _uuid.v4(),
          vaultId: vaultId,
          symbol: sym,
          exchange: 'NSE',
          quantity: _d(qty),
          avgCost: _d(avg),
          firstPurchaseDate: daysAgo(dAgo),
          assetType: type,
          lastPrice: _d(last),
        ));
      }

      await hold('NIFTYBEES', '800', '235.10', '286.40', AssetType.equityEtf, 400);
      await hold('GOLDBEES', '500', '53.20', '62.80', AssetType.goldEtf, 300);
      await hold('RELIANCE', '60', '2250.00', '2645.00', AssetType.equityEtf, 250);
      await hold('INFY', '120', '1480.00', '1695.00', AssetType.equityEtf, 500);
      await hold('SBIN', '200', '560.00', '612.00', AssetType.equityEtf, 180);

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
