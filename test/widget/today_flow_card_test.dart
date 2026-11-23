import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/features/capture/providers/capture_providers.dart';
import 'package:khazana/features/home/home_providers.dart';
import 'package:khazana/features/home/widgets/today_flow_card.dart';
import 'package:khazana_domain/entities/pending_capture.dart';
import 'package:khazana_domain/entities/transaction.dart';
import 'package:khazana_domain/services/daily_flow.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  PendingCapture capture(String id) => PendingCapture(
        id: id,
        vaultId: 'v',
        amount: Decimal.fromInt(500),
        type: TxnType.expense,
        occurredAt: DateTime.now(),
        source: CaptureSource.sms,
        uncategorized: true,
        fingerprint: id,
        capturedAt: DateTime.now(),
      );

  Widget card({
    String income = '0',
    String expense = '0',
    String regular = '0',
    int pending = 0,
  }) {
    final now = DateTime.now();
    final day = DayFlow(DateTime(now.year, now.month, now.day))
      ..income = Decimal.parse(income)
      ..expense = Decimal.parse(expense);
    return ProviderScope(
      overrides: [
        todayFlowProvider.overrideWithValue(
            (day: day, regularIncome: Decimal.parse(regular))),
        pendingCaptureListProvider.overrideWith((ref) =>
            Stream.value([for (var i = 0; i < pending; i++) capture('c$i')])),
      ],
      child: const MaterialApp(home: Scaffold(body: TodayFlowCard())),
    );
  }

  testWidgets('a quiet day says so, with no review link', (tester) async {
    await tester.pumpWidget(card());
    await tester.pumpAndSettle();
    expect(find.text('Nothing recorded yet today.'), findsOneWidget);
    expect(find.textContaining('to review'), findsNothing);
  });

  testWidgets('in, out and net, with payday marked as regular', (tester) async {
    await tester.pumpWidget(
        card(income: '85000', expense: '1250', regular: '85000', pending: 2));
    await tester.pumpAndSettle();
    expect(find.text('₹85,000.00'), findsOneWidget);
    expect(find.text('₹1,250.00'), findsOneWidget);
    expect(find.text('+₹83,750.00'), findsOneWidget);
    expect(find.text('incl. ₹85,000.00 regular'), findsOneWidget);
    expect(find.text('2 to review'), findsOneWidget);
  });

  testWidgets('a net loss is signed', (tester) async {
    await tester.pumpWidget(card(expense: '400'));
    await tester.pumpAndSettle();
    expect(find.text('−₹400.00'), findsOneWidget);
  });
}
