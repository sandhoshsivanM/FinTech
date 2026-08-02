import 'package:decimal/decimal.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/core/di/data_providers.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/domain/entities/account.dart';
import 'package:khazana/domain/entities/liability.dart';
import 'package:khazana/domain/entities/posting.dart';
import 'package:khazana/domain/repositories/account_repository.dart';
import 'package:khazana/features/accounts/providers/account_providers.dart';
import 'package:khazana/features/accounts/screens/accounts_screen.dart';
import 'package:khazana/features/liabilities/providers/liability_providers.dart';

/// The Accounts screen and the flow that puts something on it.
///
/// The chart of accounts has existed since schema v3 and nothing rendered it,
/// so the app knew a bank balance and had no screen that would say it — and no
/// way to create the account in the first place, since the only accounts that
/// ever existed were the ones LedgerWriter made implicitly while saving a
/// transaction.
void main() {
  late AppDatabase db;

  setUp(() => db = AppDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  Widget harness({
    List<Account> accounts = const [],
    List<Posting> postings = const [],
    List<Liability> liabilities = const [],
    IAccountRepository? repo,
  }) {
    return ProviderScope(
      overrides: [
        // DataGate gates the body on an open database. Without this the screen
        // renders a spinner and every assertion below is about nothing.
        appDatabaseProvider.overrideWith((ref) async => db),
        accountListProvider.overrideWith((ref) => Stream.value(accounts)),
        postingListProvider.overrideWith((ref) => Stream.value(postings)),
        liabilityListProvider.overrideWith((ref) => Stream.value(liabilities)),
        if (repo != null) accountRepositoryProvider.overrideWithValue(repo),
        currentVaultIdProvider.overrideWithValue('v1'),
      ],
      child: const MaterialApp(home: AccountsScreen()),
    );
  }

  Account bank(String name, String opening) => Account(
        id: 'acct-$name',
        vaultId: 'v1',
        name: name,
        type: AccountType.asset,
        subtype: 'bank',
        openingBalance: Decimal.parse(opening),
      );

  testWidgets('an empty vault offers to create the first account',
      (tester) async {
    await tester.pumpWidget(harness());
    await tester.pumpAndSettle();

    expect(find.text('No accounts yet'), findsOneWidget);
    // The action lives in the empty state, not only in a corner FAB: a screen
    // whose entire message is "add the first one" should carry the button that
    // does it.
    expect(find.text('Add your first account'), findsOneWidget);
  });

  testWidgets('opening balances are summed into cash on hand', (tester) async {
    await tester.pumpWidget(harness(accounts: [
      bank('HDFC Savings', '120000'),
      bank('ICICI Salary', '38000'),
    ]));
    await tester.pumpAndSettle();

    expect(find.text('Cash on hand'), findsOneWidget);
    expect(find.textContaining('1,58,000'), findsWidgets);
  });

  testWidgets('what is owed comes from liabilities, not from account subtypes',
      (tester) async {
    // Cards and loans are not rows in the chart of accounts — they have an APR
    // and an EMI an account row has nowhere to put. Sourcing them from the
    // subtype produced groups that could never populate.
    await tester.pumpWidget(harness(
      accounts: [bank('HDFC Savings', '10000')],
      liabilities: [
        Liability(
          id: 'l1',
          vaultId: 'v1',
          name: 'HDFC Credit Card',
          kind: LiabilityKind.creditCard,
          principal: Decimal.parse('45000'),
          aprPct: Decimal.parse('42'),
        ),
      ],
    ));
    await tester.pumpAndSettle();

    expect(find.text('Cards & loans'), findsOneWidget);
    expect(find.text('HDFC Credit Card'), findsOneWidget);
    expect(find.textContaining('45,000'), findsWidgets);
  });

  testWidgets('a vault with only liabilities is not called empty',
      (tester) async {
    await tester.pumpWidget(harness(liabilities: [
      Liability(
        id: 'l1',
        vaultId: 'v1',
        name: 'Personal Loan',
        kind: LiabilityKind.loan,
        principal: Decimal.parse('230000'),
        aprPct: Decimal.parse('11.5'),
      ),
    ]));
    await tester.pumpAndSettle();

    expect(find.text('No accounts yet'), findsNothing);
    expect(find.text('Personal Loan'), findsOneWidget);
  });

  testWidgets('adding an account saves it with the balance entered',
      (tester) async {
    final repo = _RecordingAccountRepo();
    await tester.pumpWidget(harness(repo: repo));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Add your first account'));
    await tester.pumpAndSettle();

    await tester.enterText(
        find.widgetWithText(TextField, 'Name'), 'HDFC Savings');
    await tester.enterText(
        find.widgetWithText(TextField, 'Balance today'), '1,20,000.50');
    await tester.tap(find.widgetWithText(FilledButton, 'Add'));
    await tester.pumpAndSettle();

    expect(repo.saved, hasLength(1));
    expect(repo.saved.single.name, 'HDFC Savings');
    expect(repo.saved.single.subtype, 'bank');
    // Commas are what a person types when copying a balance off a statement.
    expect(repo.saved.single.openingBalance, Decimal.parse('120000.50'));
  });

  testWidgets('a balance that is not a number is refused, not read as zero',
      (tester) async {
    // Silently opening the account at nothing is worse than refusing to create
    // it: the account looks real and every total that includes it is wrong.
    final repo = _RecordingAccountRepo();
    await tester.pumpWidget(harness(repo: repo));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Add your first account'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Wallet');
    await tester.enterText(
        find.widgetWithText(TextField, 'Balance today'), 'about ten thousand');
    await tester.tap(find.widgetWithText(FilledButton, 'Add'));
    await tester.pumpAndSettle();

    expect(repo.saved, isEmpty);
    expect(find.text('Enter a number, or leave it blank'), findsOneWidget);
  });

  testWidgets('a blank balance is allowed and opens at zero', (tester) async {
    final repo = _RecordingAccountRepo();
    await tester.pumpWidget(harness(repo: repo));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Add your first account'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Wallet');
    await tester.tap(find.widgetWithText(FilledButton, 'Add'));
    await tester.pumpAndSettle();

    expect(repo.saved.single.openingBalance, Decimal.zero);
  });
}

class _RecordingAccountRepo implements IAccountRepository {
  final saved = <Account>[];

  @override
  Future<void> save(Account account) async => saved.add(account);

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName} not used by this test');
}
