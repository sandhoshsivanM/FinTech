import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/entitlement/entitlement_providers.dart';
import 'package:khazana/domain/entitlement/feature_gate.dart';
import 'package:khazana/domain/entitlement/pro_feature.dart';
import 'package:khazana/features/pro/widgets/pro_gate.dart';

/// A locked screen shows its real layout faded, with one clean lock card and no
/// blur; an unlocked one is just the screen.
void main() {
  Widget host(GateDecision d) => ProviderScope(
    overrides: [gateProvider(ProFeature.taxCentre).overrideWithValue(d)],
    child: const MaterialApp(
      home: Scaffold(
        body: ProGate(
          feature: ProFeature.taxCentre,
          title: 'Tax centre',
          benefits: ['Short- and long-term gains', 'What a sale would cost'],
          child: Text('Real screen'),
        ),
      ),
    ),
  );

  testWidgets('locked: faded preview, lock card, no blur', (tester) async {
    await tester.pumpWidget(
      host(const GateDecision(false, GateReason.needsPro)),
    );
    expect(find.text('Real screen'), findsOneWidget);
    expect(find.text('Tax centre is part of Pro'), findsOneWidget);
    expect(find.text('See what Pro includes'), findsOneWidget);
    expect(find.text('Short- and long-term gains'), findsOneWidget);
    expect(find.byType(ImageFiltered), findsNothing);
    expect(find.byType(BackdropFilter), findsNothing);
    final faded = tester.widget<Opacity>(
      find.ancestor(
        of: find.text('Real screen'),
        matching: find.byType(Opacity),
      ),
    );
    expect(faded.opacity, 0.55);
  });

  testWidgets('unlocked: just the screen', (tester) async {
    await tester.pumpWidget(
      host(const GateDecision(true, GateReason.unlocked)),
    );
    expect(find.text('Real screen'), findsOneWidget);
    expect(find.text('See what Pro includes'), findsNothing);
  });
}
