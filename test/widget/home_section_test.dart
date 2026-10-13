import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:khazana/domain/entities/account.dart';
import 'package:khazana/domain/entities/liability.dart';
import 'package:khazana/features/accounts/providers/account_providers.dart';
import 'package:khazana/features/home/home_providers.dart';
import 'package:khazana/features/home/widgets/wallet_stack.dart';
import 'package:khazana/features/home/widgets/week_flow_card.dart';
import 'package:khazana/domain/services/daily_flow.dart';
import 'package:khazana/features/liabilities/providers/liability_providers.dart';
import 'package:khazana/features/reports/providers/dashboard_providers.dart';

/// The home screen's wallet deck and the figures behind it.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Account acct(
    String id,
    String subtype,
    String opening, {
    bool archived = false,
  }) => Account(
    id: id,
    vaultId: 'v1',
    name: 'Acct $id',
    type: AccountType.asset,
    subtype: subtype,
    openingBalance: Decimal.parse(opening),
    archived: archived,
  );

  Liability card(String id, String owed) => Liability(
    id: id,
    vaultId: 'v1',
    name: 'Card $id',
    kind: LiabilityKind.creditCard,
    principal: Decimal.parse(owed),
    aprPct: Decimal.parse('36'),
  );

  final overrides = [
    accountListProvider.overrideWith(
      (ref) => Stream.value([
        acct('small', 'cash', '500'),
        acct('big', 'bank', '90000'),
        acct('gone', 'bank', '1000', archived: true),
        acct('fd', 'investment', '50000'),
      ]),
    ),
    postingListProvider.overrideWith((ref) => Stream.value(const [])),
    liabilityListProvider.overrideWith(
      (ref) => Stream.value([
        card('visa', '12000'),
        Liability(
          id: 'home',
          vaultId: 'v1',
          name: 'Home loan',
          kind: LiabilityKind.loan,
          principal: Decimal.parse('2000000'),
          aprPct: Decimal.parse('9'),
        ),
      ]),
    ),
  ];

  Future<ProviderContainer> ready() async {
    final c = ProviderContainer(overrides: overrides);
    addTearDown(c.dispose);
    // Let the three streams emit.
    c.listen(walletCardsProvider, (_, _) {});
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
    return c;
  }

  test(
    'the deck holds live bank and cash, fullest first, then cards',
    () async {
      final c = await ready();
      final cards = c.read(walletCardsProvider)!;
      expect(cards.map((w) => w.id), ['big', 'small', 'visa']);
      expect(cards.last.owed, isTrue);
    },
  );

  test(
    'total balance is bank + cash only — not cards, loans or investments',
    () async {
      final c = await ready();
      expect(c.read(liquidBalanceProvider), Decimal.parse('90500'));
    },
  );

  Widget harness() => ProviderScope(
    overrides: overrides,
    child: const MaterialApp(
      home: Scaffold(body: SingleChildScrollView(child: WalletStack())),
    ),
  );

  testWidgets('tapping a dot picks that card, without a swipe', (tester) async {
    await tester.pumpWidget(harness());
    await tester.pumpAndSettle();

    final dot = find.bySemanticsLabel('Acct small');
    expect(dot, findsOneWidget);
    // `containsSemantics` is deprecated from Flutter 3.40 in favour of
    // `isSemantics`, which 3.38 (local) lacks; keep it until both move on.
    // ignore: deprecated_member_use
    expect(tester.getSemantics(dot), containsSemantics(isSelected: false));
    await tester.tap(dot);
    await tester.pumpAndSettle();
    // `containsSemantics` is deprecated from Flutter 3.40 in favour of
    // `isSemantics`, which 3.38 (local) lacks; keep it until both move on.
    // ignore: deprecated_member_use
    expect(tester.getSemantics(dot), containsSemantics(isSelected: true));
  });

  testWidgets('flinging the front card sideways brings the next one forward', (
    tester,
  ) async {
    await tester.pumpWidget(harness());
    await tester.pumpAndSettle();

    final first = find.bySemanticsLabel('Acct big');
    final next = find.bySemanticsLabel('Acct small');
    // The front card carries its own label as well as its dot.
    // `containsSemantics` is deprecated from Flutter 3.40 in favour of
    // `isSemantics`, which 3.38 (local) lacks; keep it until both move on.
    // ignore: deprecated_member_use
    expect(tester.getSemantics(next), containsSemantics(isSelected: false));
    await tester.fling(find.byType(AspectRatio), const Offset(-200, 0), 1500);
    await tester.pumpAndSettle();
    // `containsSemantics` is deprecated from Flutter 3.40 in favour of
    // `isSemantics`, which 3.38 (local) lacks; keep it until both move on.
    // ignore: deprecated_member_use
    expect(tester.getSemantics(next), containsSemantics(isSelected: true));
    expect(first, findsWidgets);
  });

  testWidgets('ghost mode masks every card balance', (tester) async {
    SharedPreferences.setMockInitialValues({'ghost_mode_v1': true});
    await tester.pumpWidget(harness());
    await tester.pumpAndSettle();
    final container = ProviderScope.containerOf(
      tester.element(find.byType(WalletStack)),
    );
    container.read(ghostModeProvider.notifier).set(true);
    await tester.pumpAndSettle();

    expect(find.textContaining('90,000'), findsNothing);
    expect(find.text('••••••'), findsWidgets);
  });

  group('last 7 days', () {
    List<DayFlow> fortnight() {
      final today = DateTime.now();
      final days = [
        for (var i = 13; i >= 0; i--)
          DayFlow(DateTime(today.year, today.month, today.day - i)),
      ];
      days.last.expense = Decimal.parse('1240');
      days[12].income = Decimal.parse('90000');
      days[3].expense = Decimal.parse('1000'); // last week, to compare
      return days;
    }

    Widget card() {
      final f = fortnight();
      return ProviderScope(
        overrides: [
          fortnightFlowProvider.overrideWithValue(f),
          weekFlowProvider.overrideWithValue(f.sublist(7)),
        ],
        child: const MaterialApp(
          home: Scaffold(body: SingleChildScrollView(child: WeekFlowCard())),
        ),
      );
    }

    Finder readout(String s) => find.textContaining(s, findRichText: true);

    testWidgets('opens on today and a tap shows that day', (tester) async {
      await tester.pumpWidget(card());
      await tester.pumpAndSettle();
      expect(readout('Today  |  In ₹0.00'), findsOneWidget);
      // ₹1,240 this week against ₹1,000 last week.
      expect(find.text('24%'), findsOneWidget);
      expect(find.byIcon(Icons.arrow_upward_rounded), findsOneWidget);

      final cols = find.byWidgetPredicate(
        (w) => w is Semantics && (w.properties.button ?? false),
      );
      // cols.at(0) is the card title's info hint; the seven days follow it.
      await tester.tap(cols.at(6));
      await tester.pumpAndSettle();
      expect(readout('In ₹90,000.00'), findsOneWidget);
    });

    testWidgets('ghost mode masks every figure', (tester) async {
      SharedPreferences.setMockInitialValues({'ghost_mode_v1': true});
      await tester.pumpWidget(card());
      await tester.pumpAndSettle();
      ProviderScope.containerOf(
        tester.element(find.byType(WeekFlowCard)),
      ).read(ghostModeProvider.notifier).set(true);
      await tester.pumpAndSettle();
      expect(readout('1,240'), findsNothing);
      expect(readout('90,000'), findsNothing);
    });
  });
}
