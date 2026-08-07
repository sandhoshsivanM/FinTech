@Tags(['golden'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/theme/app_theme.dart';
import 'package:khazana/presentation/charts/donut_chart.dart';
import 'package:khazana/presentation/glass_card.dart';

/// Goldens for the folded "Others" disclosure, in the real Vault theme.
///
/// The widget test next door proves the behaviour; these prove the *look* —
/// that the expanded rows sit under a hairline rule at legible weight and do
/// not swamp the card. That is the part a behavioural assertion cannot see, and
/// it is exactly what regressed on mobile before.
void main() {
  final palette = <Color>[
    const Color(0xFF189E6E),
    const Color(0xFFBE8420),
    const Color(0xFF2E92C4),
    const Color(0xFFC9538A),
    const Color(0xFF4F7CFF),
    const Color(0xFF8E7CC3),
    const Color(0xFFCC6435),
  ];

  const names = [
    'HDFCBANK', 'INFY', 'ICICIBANK', 'TCS', 'NIFTYBEES', 'RELIANCE', 'SBIN',
    'TATAMOTORS', 'MARUTI', 'BHARTIARTL', 'LT', 'AXISBANK', 'ITC', 'WIPRO',
    'HCLTECH', 'SUNPHARMA', 'TITAN', 'GOLDBEES',
  ];

  Widget frame(Widget child) => MediaQuery(
        data: const MediaQueryData(disableAnimations: true),
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: AppTheme.dark,
          home: Scaffold(
            body: Center(
              child: SizedBox(width: 360, child: GlassCard(child: child)),
            ),
          ),
        ),
      );

  DonutChart chart() => DonutChart(
        segments: [
          for (var i = 0; i < names.length; i++)
            DonutSegment(names[i], (names.length - i) * 3.0,
                palette[i % palette.length]),
        ],
        size: 132,
        strokeWidth: 18,
        maxSlices: 7,
        centerText: '2.41 Cr',
        centerSub: 'Total',
      );

  testWidgets('folded', (tester) async {
    await tester.pumpWidget(frame(chart()));
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(DonutChart),
      matchesGoldenFile('goldens/donut_others_folded.png'),
    );
  });

  testWidgets('expanded', (tester) async {
    await tester.pumpWidget(frame(chart()));
    await tester.tap(find.textContaining('Others ('));
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(DonutChart),
      matchesGoldenFile('goldens/donut_others_expanded.png'),
    );
  });
}
