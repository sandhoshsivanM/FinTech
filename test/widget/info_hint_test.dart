import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/help/info_hint.dart';
import 'package:khazana/core/help/section_help.dart';

void main() {
  Widget host(Widget child) => MaterialApp(
    home: Scaffold(body: Center(child: child)),
  );

  testWidgets('has a 44px tap target and a "What is <title>?" label', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(host(const InfoHint('dashboard.totalBalance')));

    expect(tester.getSize(find.byType(InfoHint)), const Size(44, 44));
    expect(find.bySemanticsLabel('What is Total balance?'), findsOneWidget);
    handle.dispose();
  });

  testWidgets('opens a popover with the title and body, outside tap closes', (
    tester,
  ) async {
    final entry = SectionHelp.of('xirr');
    await tester.pumpWidget(host(const InfoHint('xirr')));

    expect(find.text(entry.title), findsNothing);
    await tester.tap(find.byType(InfoHint));
    await tester.pumpAndSettle();
    expect(find.text(entry.title), findsOneWidget);
    expect(find.text(entry.body), findsOneWidget);

    await tester.tapAt(const Offset(5, 5));
    await tester.pumpAndSettle();
    expect(find.text(entry.title), findsNothing);
  });

  testWidgets('Back dismisses the popover', (tester) async {
    await tester.pumpWidget(host(const InfoHint('dashboard.netWorth')));
    await tester.tap(find.byType(InfoHint));
    await tester.pumpAndSettle();
    expect(find.text('Net worth'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Net worth'), findsNothing);
  });
}
