import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_online/cards/card_maths.dart';
import 'package:khazana_online/cards/card_store.dart';
import 'package:khazana_online/cards/cards_screen.dart';

void main() {
  final now = DateTime(2026, 10, 27);
  Widget app(MemoryCardStore store, [List<CardTxn> txns = const []]) =>
      MaterialApp(
        home: CardsScreen(store: store, txns: () async => txns, now: () => now),
      );

  testWidgets('empty state, then add a card through the form', (tester) async {
    final store = MemoryCardStore();
    await tester.pumpWidget(app(store));
    await tester.pumpAndSettle();
    expect(find.textContaining('No cards yet'), findsOneWidget);

    await tester.tap(find.byKey(const Key('add-card')));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('never asks for the full card number'),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('save-card')));
    await tester.pumpAndSettle();
    expect(find.text('Enter exactly 4 digits.'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('name')), 'Axis Ace');
    await tester.enterText(find.byKey(const Key('last4')), '4417');
    await tester.enterText(find.byKey(const Key('limit')), '₹1,00,000');
    await tester.enterText(find.byKey(const Key('statementDay')), '12');
    await tester.enterText(find.byKey(const Key('dueDay')), '2');
    await tester.tap(find.byKey(const Key('save-card')));
    await tester.pumpAndSettle();

    expect(store.cards.values.single.last4, '4417');
    expect(find.text('•••• 4417'), findsOneWidget);
    expect(
      find.text(
        'Credit scores reward staying under 30% on each card. Worked out on this device from your bank alerts.',
      ),
      findsOneWidget,
    );
  });

  testWidgets(
    'detail shows advice from matched transactions; delete removes the card',
    (tester) async {
      final store = MemoryCardStore()
        ..cards['c'] = const CreditCard(
          id: 'c',
          name: 'HDFC',
          network: 'Visa',
          last4: '1234',
          limitPaise: 10000000,
          statementDay: 15,
          dueDay: 4,
        );
      final txns = [
        CardTxn(
          id: 't',
          date: DateTime(2026, 10, 26),
          paise: 5000000,
          isExpense: true,
          note: 'Croma',
          last4: '1234',
        ),
      ];
      await tester.pumpWidget(app(store, txns));
      await tester.pumpAndSettle();
      expect(find.text('₹50,000'), findsWidgets);

      await tester.tap(find.text('Card details'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('advice')), findsOneWidget);
      expect(
        (tester.widget(find.byKey(const Key('advice'))) as Text).data,
        contains('Paying ₹20,000'),
      );
      expect(find.text('Croma'), findsOneWidget);
      expect(find.text('Yesterday · from bank alert'), findsOneWidget);
      expect(find.text('Due in 8 days'), findsOneWidget);

      await tester.ensureVisible(find.byKey(const Key('delete-card')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('delete-card')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('confirm-delete')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm-delete')));
      await tester.pumpAndSettle();
      expect(store.cards, isEmpty);
      expect(find.textContaining('No cards yet'), findsOneWidget);
    },
  );

  testWidgets('Credit report opens a coming-soon screen', (tester) async {
    await tester.pumpWidget(app(MemoryCardStore()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Credit report · P5'));
    await tester.pumpAndSettle();
    expect(find.textContaining('coming soon'), findsOneWidget);
  });
}
