import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/theme/app_theme.dart';
import 'package:khazana/presentation/charts/skyline_chart.dart';
import 'package:khazana_domain/entities/transaction.dart';
import 'package:khazana_domain/services/skyline.dart';

void main() {
  // Wed 25 Nov 2026. Two entries on Tue 24 Nov; the only spending in range.
  final today = DateTime(2026, 11, 25);
  Txn txn(String id, String amount) => Txn(
    id: id,
    vaultId: 'v',
    amount: Decimal.parse(amount),
    type: TxnType.expense,
    categoryId: 'c',
    date: DateTime(2026, 11, 24, 10),
    createdAt: DateTime(2026, 11, 24, 10),
  );
  final sky = spendSkyline(
    [txn('a', '1000'), txn('b', '340')],
    lastWeeks(today, 13),
    today,
  );
  final tue24 = sky.cells.indexWhere((c) => c.day == DateTime(2026, 11, 24));

  String describe(int i) {
    final c = sky.cells[i];
    return c.amount == Decimal.zero
        ? 'Nothing spent'
        : 'Tue 24 Nov · ${c.amount} · ${c.count} entries';
  }

  Widget host(ThemeData theme) => MaterialApp(
    theme: theme,
    home: MediaQuery(
      data: const MediaQueryData(
        size: Size(800, 900),
        disableAnimations: true,
      ),
      child: Scaffold(
        body: SingleChildScrollView(
          child: SkylineChart(
            cells: sky.cells,
            describe: describe,
            semanticLabel: 'Spending per day.',
          ),
        ),
      ),
    ),
  );

  for (final (name, theme) in [
    ('light', AppTheme.light),
    ('dark', AppTheme.dark),
  ]) {
    testWidgets('tapping the tallest bar reads it out ($name)', (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(host(theme));
      await tester.pumpAndSettle();

      expect(find.text('Hover or tap a day'), findsOneWidget);

      // The only non-zero day is the tallest bar; scan the chart for it.
      final box = tester.getRect(find.byType(CustomPaint).last);
      String? found;
      for (var y = box.top + 4; y < box.bottom && found == null; y += 6) {
        for (var x = box.left + 4; x < box.right && found == null; x += 6) {
          await tester.tapAt(Offset(x, y));
          await tester.pump();
          final hit = find.textContaining('entries');
          if (hit.evaluate().isNotEmpty) {
            found = (hit.evaluate().first.widget as Text).data;
          }
        }
      }
      expect(tue24, greaterThan(0));
      expect(found, 'Tue 24 Nov · 1340 · 2 entries');
    });
  }

  testWidgets('grid view and toggling keep working', (tester) async {
    await tester.binding.setSurfaceSize(const Size(800, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(host(AppTheme.light));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Grid'));
    await tester.pumpAndSettle();
    expect(find.text('Hover or tap a day'), findsOneWidget);
    expect(find.text('Less '), findsOneWidget);
  });

  testWidgets('a narrow screen shows the last 13 weeks note', (tester) async {
    await tester.binding.setSurfaceSize(const Size(380, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final wide = spendSkyline(const [], lastWeeks(today, 26), today);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: MediaQuery(
          data: const MediaQueryData(
            size: Size(380, 900),
            disableAnimations: true,
          ),
          child: Scaffold(
            body: SingleChildScrollView(
              child: SkylineChart(
                cells: wide.cells,
                describe: (_) => '',
                semanticLabel: 'x',
                narrowWeeks: 13,
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Last 13 weeks on this screen'), findsOneWidget);
  });
}
