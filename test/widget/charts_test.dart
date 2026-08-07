import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/domain/entities/asset_group.dart';
import 'package:khazana/presentation/asset_group_colors.dart';
import 'package:khazana/presentation/charts/area_chart.dart';
import 'package:khazana/presentation/charts/donut_chart.dart';
import 'package:khazana/presentation/charts/gauge_chart.dart';
import 'package:khazana/presentation/charts/sunburst_chart.dart';

Widget wrap(Widget child) => MaterialApp(
      home: Scaffold(body: Center(child: SizedBox(width: 360, child: child))),
    );

void main() {
  group('GaugeChart', () {
    testWidgets('a null value reads "Not yet tracked" and shows no number',
        (tester) async {
      // This single behaviour is the entire honesty rule's UI surface. If it
      // regresses, an untracked score renders as a failing grade.
      await tester.pumpWidget(wrap(const GaugeChart(value: null)));
      expect(find.text('Not yet tracked'), findsOneWidget);
      expect(find.text('0'), findsNothing);
      expect(find.text('—'), findsOneWidget);
    });

    testWidgets('a tracked value shows the number and its grade',
        (tester) async {
      await tester.pumpWidget(
          wrap(const GaugeChart(value: 72, sublabel: 'Strong')));
      expect(find.text('72'), findsOneWidget);
      expect(find.text('Strong'), findsOneWidget);
      expect(find.text('Not yet tracked'), findsNothing);
    });

    testWidgets('a zero score is not the same as no score', (tester) async {
      await tester.pumpWidget(wrap(const GaugeChart(value: 0, sublabel: 'At risk')));
      expect(find.text('0'), findsOneWidget);
      expect(find.text('Not yet tracked'), findsNothing);
    });

    testWidgets('renders out-of-range values without throwing', (tester) async {
      await tester.pumpWidget(wrap(const GaugeChart(value: 340)));
      expect(tester.takeException(), isNull);
      // Clamped to the scale rather than sweeping past the arc's end.
      expect(find.text('100'), findsOneWidget);
    });

    testWidgets('announces itself to assistive tech', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(
          wrap(const GaugeChart(value: 72, sublabel: 'Strong')));
      expect(find.bySemanticsLabel('72, Strong'), findsOneWidget);
      handle.dispose();
    });
  });

  group('AreaChart', () {
    testWidgets('fewer than two points renders the empty state',
        (tester) async {
      await tester.pumpWidget(wrap(const AreaChart(values: [42])));
      expect(find.text('Not enough data yet'), findsOneWidget);
    });

    testWidgets('a perfectly flat series does not divide by zero',
        (tester) async {
      await tester.pumpWidget(
          wrap(const AreaChart(values: [100, 100, 100, 100])));
      expect(tester.takeException(), isNull);
      expect(find.text('Not enough data yet'), findsOneWidget);
    });

    testWidgets('a real series paints', (tester) async {
      await tester.pumpWidget(
          wrap(const AreaChart(values: [10, 40, 25, 80, 60])));
      expect(tester.takeException(), isNull);
      expect(find.text('Not enough data yet'), findsNothing);
      expect(find.byType(CustomPaint), findsWidgets);
    });
  });

  group('SunburstChart', () {
    SunburstNode leaf(String label, double value, Color color) =>
        SunburstNode(key: label, label: label, value: value, color: color);

    SunburstNode root() => SunburstNode(
          key: 'root',
          label: 'Portfolio',
          value: 1000,
          color: Colors.transparent,
          children: [
            SunburstNode(
              key: 'equity',
              label: 'Equity',
              value: 700,
              color: groupColor(AssetGroup.equity),
              children: [
                leaf('IT', 400, groupShades(AssetGroup.equity, 2, dark: false)[0]),
                leaf('Energy', 300,
                    groupShades(AssetGroup.equity, 2, dark: false)[1]),
              ],
            ),
            SunburstNode(
              key: 'gold',
              label: 'Gold',
              value: 300,
              color: groupColor(AssetGroup.gold),
              children: [leaf('GOLDBEES', 300, groupColor(AssetGroup.gold))],
            ),
          ],
        );

    testWidgets('renders the inner ring legend in the order given',
        (tester) async {
      await tester.pumpWidget(wrap(SunburstChart(root: root())));
      expect(find.text('Equity 70%'), findsOneWidget);
      expect(find.text('Gold 30%'), findsOneWidget);
    });

    testWidgets('shows no breadcrumb at the top level', (tester) async {
      await tester.pumpWidget(wrap(SunburstChart(root: root())));
      // 'Portfolio' appears in the centre, but not as a breadcrumb trail.
      expect(find.text('Equity'), findsNothing);
    });

    testWidgets('drilling in reports the new path', (tester) async {
      List<SunburstNode>? path;
      await tester.pumpWidget(wrap(SunburstChart(
        root: root(),
        onFocusChanged: (p) => path = p,
      )));

      // Aim at the MIDPOINT of the Equity arc, not its leading edge: segments
      // are separated by a gap, and a tap exactly on the boundary correctly
      // hits neither.
      //
      // Equity is 70% of the ring starting at 12 o'clock, so its midpoint sits
      // 0.7π clockwise from straight up. The radius matters too — the inner
      // ring is what drills, and a tap further out lands on the outer ring,
      // which selects rather than zooms.
      final chart = tester.getRect(find.byType(GestureDetector));
      const innerRingRadius = 220 / 2 - 34 * 1.5;
      const midAngle = -math.pi / 2 + 0.7 * math.pi;
      await tester.tapAt(chart.center +
          Offset(math.cos(midAngle), math.sin(midAngle)) * innerRingRadius);
      await tester.pumpAndSettle();

      expect(path, isNotNull, reason: 'the tap missed the inner ring');
      expect(path!.map((n) => n.label).toList(), ['Portfolio', 'Equity']);
      // Once drilled in, the breadcrumb offers the way back.
      expect(find.text('Portfolio'), findsWidgets);
    });

    testWidgets('an empty root renders a message rather than blank rings',
        (tester) async {
      await tester.pumpWidget(wrap(const SunburstChart(
        root: SunburstNode(
            key: 'root', label: 'Portfolio', value: 0, color: Colors.grey),
      )));
      expect(find.text('Nothing to show yet'), findsOneWidget);
    });
  });

  group('groupShades', () {
    test('the first step is the group colour itself', () {
      for (final g in AssetGroup.values) {
        expect(groupShades(g, 3, dark: false).first, groupColor(g));
      }
    });

    test('steps get lighter toward the surface, monotonically', () {
      final shades = groupShades(AssetGroup.equity, 5, dark: false);
      double lum(Color c) => c.computeLuminance();
      for (var i = 1; i < shades.length; i++) {
        expect(lum(shades[i]), greaterThan(lum(shades[i - 1])),
            reason: 'step $i is not lighter than step ${i - 1}');
      }
    });

    test('caps at five steps', () {
      // Past five, adjacent steps stop separating and the chart would be
      // claiming to distinguish things a reader cannot.
      expect(groupShades(AssetGroup.equity, 12, dark: false), hasLength(5));
    });

    test('the same (group, index) is always the same colour', () {
      // Shade index follows a stable entity key, never value rank — otherwise
      // a price movement repaints the chart and the colours stop meaning
      // anything.
      final a = groupShades(AssetGroup.debt, 4, dark: true);
      final b = groupShades(AssetGroup.debt, 4, dark: true);
      expect(a, b);
    });

    test('light and dark ramps differ', () {
      expect(groupShades(AssetGroup.equity, 3, dark: false)[2],
          isNot(groupShades(AssetGroup.equity, 3, dark: true)[2]));
    });
  });

  group('DonutChart folding', () {
    List<DonutSegment> many(int n) => [
          for (var i = 0; i < n; i++)
            DonutSegment('ITEM$i', (n - i).toDouble(), Colors.teal),
        ];

    testWidgets('below the limit every segment keeps its own legend row',
        (tester) async {
      await tester.pumpWidget(wrap(DonutChart(segments: many(4), maxSlices: 6)));
      expect(find.text('ITEM3'), findsOneWidget);
      expect(find.textContaining('Others ('), findsNothing);
    });

    testWidgets('the tail folds into one row that names how many are in it',
        (tester) async {
      await tester.pumpWidget(wrap(DonutChart(segments: many(10), maxSlices: 6)));
      expect(find.text('ITEM5'), findsOneWidget); // last of the head
      expect(find.text('ITEM6'), findsNothing); // folded away
      expect(find.text('Others (4)'), findsOneWidget);
    });

    testWidgets('tapping "Others" reveals every folded item, then hides again',
        (tester) async {
      // The whole point of the disclosure: a folded row that cannot be opened
      // tells the reader a third of their money is somewhere unnamed.
      await tester.pumpWidget(wrap(DonutChart(segments: many(10), maxSlices: 6)));
      await tester.tap(find.text('Others (4)'));
      await tester.pumpAndSettle();
      for (var i = 6; i < 10; i++) {
        expect(find.text('ITEM$i'), findsOneWidget);
      }
      await tester.tap(find.text('Others (4)'));
      await tester.pumpAndSettle();
      expect(find.text('ITEM9'), findsNothing);
    });

    testWidgets('the folded share is the sum of what it hides', (tester) async {
      // 4 segments of 10 each folded out of a 100 total must read 40%, not the
      // share of any one of them.
      final segs = [
        for (var i = 0; i < 6; i++) DonutSegment('H$i', 10, Colors.teal),
        for (var i = 0; i < 4; i++) DonutSegment('T$i', 10, Colors.teal),
      ];
      await tester.pumpWidget(wrap(DonutChart(segments: segs, maxSlices: 6)));
      expect(find.text('40%'), findsOneWidget);
    });

    testWidgets('without maxSlices nothing is folded or dropped',
        (tester) async {
      await tester.pumpWidget(wrap(DonutChart(segments: many(12))));
      expect(find.text('ITEM11'), findsOneWidget);
      expect(find.textContaining('Others ('), findsNothing);
    });
  });
}
