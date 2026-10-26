import 'package:decimal/decimal.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/core/di/data_providers.dart';
import 'package:khazana/core/services/notification_sync_service.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/features/budget/providers/budget_providers.dart';
import 'package:khazana/features/budget/screens/budget_screen.dart';
import 'package:khazana/features/goals/providers/goal_providers.dart';
import 'package:khazana/features/goals/screens/goals_screen.dart';
import 'package:khazana/features/insurance/providers/insurance_providers.dart';
import 'package:khazana/features/insurance/screens/insurance_screen.dart';
import 'package:khazana/features/liabilities/providers/liability_providers.dart';
import 'package:khazana/features/liabilities/screens/liabilities_screen.dart';
import 'package:khazana/features/transactions/providers/category_providers.dart';
import 'package:khazana/features/transactions/providers/transaction_providers.dart';
import 'package:khazana_domain/entities/budget.dart';
import 'package:khazana_domain/entities/category.dart';
import 'package:khazana_domain/entities/goal.dart';
import 'package:khazana_domain/entities/insurance.dart';
import 'package:khazana_domain/entities/liability.dart';
import 'package:khazana_domain/repositories/budget_repository.dart';
import 'package:khazana_domain/repositories/goal_repository.dart';
import 'package:khazana_domain/repositories/insurance_repository.dart';
import 'package:khazana_domain/repositories/liability_repository.dart';

/// Tapping a budget, goal, liability or policy opens its form prefilled, and
/// saving writes over the same id rather than adding a second record.
///
/// The repositories are recorders: what matters here is which entity the screen
/// hands to `save`, and that it carries the original id.
class _NoReconcile extends NotificationSyncService {
  _NoReconcile(super.ref);
  @override
  void scheduleReconcile({Duration delay = const Duration(seconds: 2)}) {}
}

/// A [TransactionNotifier] that never touches a repository.
class _FixedTxns extends StateNotifier<TransactionState>
    implements TransactionNotifier {
  _FixedTxns(super.state);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Budgets implements IBudgetRepository {
  final saved = <Budget>[];
  @override
  Future<void> save(Budget b) async => saved.add(b);
  @override
  Stream<List<Budget>> watch(String vaultId) => const Stream.empty();
  @override
  Future<List<Budget>> getAll(String vaultId) async => const [];
  @override
  Future<void> delete(String id) async {}
}

class _Goals implements IGoalRepository {
  final saved = <Goal>[];
  @override
  Future<void> saveGoal(Goal g) async => saved.add(g);
  @override
  Stream<List<Goal>> watch(String vaultId) => const Stream.empty();
  @override
  Future<void> deleteGoal(String id) async {}
  @override
  Future<List<GoalContribution>> contributions(String goalId) async =>
      const [];
  @override
  Future<void> contribute(String goalId, GoalContribution c) async {}
}

class _Liabilities implements ILiabilityRepository {
  final saved = <Liability>[];
  @override
  Future<void> save(Liability l) async => saved.add(l);
  @override
  Stream<List<Liability>> watch(String vaultId) => const Stream.empty();
  @override
  Future<List<Liability>> getAll(String vaultId) async => const [];
  @override
  Future<void> delete(String id) async {}
}

class _Policies implements IInsuranceRepository {
  final saved = <Insurance>[];
  @override
  Future<void> save(Insurance i) async => saved.add(i);
  @override
  Stream<List<Insurance>> watch(String vaultId) => const Stream.empty();
  @override
  Future<List<Insurance>> getAll(String vaultId) async => const [];
  @override
  Future<void> delete(String id) async {}
}

void main() {
  late AppDatabase db;

  setUp(() => db = AppDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  Future<void> pump(
    WidgetTester tester,
    Widget screen,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          // DataGate gates the body on an open database.
          appDatabaseProvider.overrideWith((ref) async => db),
          currentVaultIdProvider.overrideWithValue('v1'),
          notificationSyncProvider.overrideWith((ref) => _NoReconcile(ref)),
          // Budget progress reads transactions; a fixed state keeps the test
          // off a database stream.
          transactionListProvider.overrideWith(
            (ref) => _FixedTxns(TransactionData(const [])),
          ),
          ...overrides,
        ],
        child: MaterialApp(home: screen),
      ),
    );
    await tester.pumpAndSettle();
  }

  Finder field(String label) => find.widgetWithText(TextField, label);

  testWidgets('editing a budget saves the new limit under the same id', (
    tester,
  ) async {
    final repo = _Budgets();
    final budget = Budget(
      id: 'b1',
      vaultId: 'v1',
      categoryId: 'c1',
      amountLimit: Decimal.fromInt(5000),
      alertThresholdPct: 80,
    );
    await pump(tester, const BudgetScreen(), [
      budgetRepositoryProvider.overrideWithValue(repo),
      budgetListProvider.overrideWith((ref) => Stream.value([budget])),
      categoryListProvider.overrideWith(
        (ref) => Stream.value(const [
          Category(id: 'c1', vaultId: 'v1', name: 'Food'),
        ]),
      ),
    ]);

    await tester.tap(find.text('Food'));
    await tester.pumpAndSettle();
    expect(find.text('Edit monthly budget'), findsOneWidget);
    // Prefilled from the budget, not blank.
    expect(find.text('5000'), findsOneWidget);

    await tester.enterText(field('Monthly limit (₹)'), '7500');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(repo.saved, hasLength(1));
    expect(repo.saved.single.id, 'b1');
    expect(repo.saved.single.categoryId, 'c1');
    expect(repo.saved.single.amountLimit, Decimal.fromInt(7500));
    expect(repo.saved.single.alertThresholdPct, 80);
  });

  testWidgets('editing a goal keeps its progress and changes the target', (
    tester,
  ) async {
    final repo = _Goals();
    final goal = Goal(
      id: 'g1',
      vaultId: 'v1',
      name: 'Bike',
      goalType: GoalType.vehicle,
      targetAmount: Decimal.fromInt(100000),
      currentAmount: Decimal.fromInt(25000),
      targetDate: DateTime(2030, 1, 15),
    );
    await pump(tester, const GoalsScreen(), [
      goalRepositoryProvider.overrideWithValue(repo),
      goalListProvider.overrideWith((ref) => Stream.value([goal])),
    ]);

    await tester.tap(find.text('Bike'));
    await tester.pumpAndSettle();
    expect(find.text('Edit goal'), findsOneWidget);
    expect(find.text('15 Jan 2030'), findsOneWidget);

    await tester.enterText(field('Name'), 'Scooter');
    await tester.enterText(field('Target amount (₹)'), '90000');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    final saved = repo.saved.single;
    expect(saved.id, 'g1');
    expect(saved.name, 'Scooter');
    expect(saved.targetAmount, Decimal.fromInt(90000));
    expect(saved.currentAmount, Decimal.fromInt(25000));
    expect(saved.targetDate, DateTime(2030, 1, 15));
  });

  testWidgets('editing a liability saves every field under the same id', (
    tester,
  ) async {
    final repo = _Liabilities();
    final loan = Liability(
      id: 'l1',
      vaultId: 'v1',
      name: 'Car loan',
      kind: LiabilityKind.loan,
      principal: Decimal.fromInt(400000),
      aprPct: Decimal.parse('9.5'),
      termMonths: 48,
    );
    await pump(tester, const LiabilitiesScreen(), [
      liabilityRepositoryProvider.overrideWithValue(repo),
      liabilityListProvider.overrideWith((ref) => Stream.value([loan])),
    ]);

    await tester.tap(find.text('Car loan'));
    await tester.pumpAndSettle();
    expect(find.text('Edit liability'), findsOneWidget);
    expect(find.text('48'), findsOneWidget);

    await tester.enterText(field('Outstanding (₹)'), '350000');
    await tester.enterText(field('Term (months)'), '36');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    final saved = repo.saved.single;
    expect(saved.id, 'l1');
    expect(saved.principal, Decimal.fromInt(350000));
    expect(saved.aprPct, Decimal.parse('9.5'));
    expect(saved.termMonths, 36);
  });

  testWidgets('editing a policy keeps its id and renewal date', (tester) async {
    final repo = _Policies();
    final policy = Insurance(
      id: 'p1',
      vaultId: 'v1',
      name: 'Health plan',
      type: InsuranceType.health,
      coverAmount: Decimal.fromInt(500000),
      premium: Decimal.fromInt(12000),
      provider: 'Acme',
      renewalDate: DateTime(2031, 3, 1),
    );
    await pump(tester, const InsuranceScreen(), [
      insuranceRepositoryProvider.overrideWithValue(repo),
      insuranceListProvider.overrideWith((ref) => Stream.value([policy])),
    ]);

    // Below the KPI tiles and the gap tray, so scroll to it first.
    await tester.scrollUntilVisible(find.text('Health plan'), 200);
    await tester.tap(find.text('Health plan'));
    await tester.pumpAndSettle();
    expect(find.text('Edit policy'), findsOneWidget);

    await tester.enterText(field('Cover amount (₹)'), '1000000');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    final saved = repo.saved.single;
    expect(saved.id, 'p1');
    expect(saved.coverAmount, Decimal.fromInt(1000000));
    expect(saved.provider, 'Acme');
    expect(saved.renewalDate, DateTime(2031, 3, 1));
  });
}
