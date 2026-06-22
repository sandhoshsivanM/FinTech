import 'package:fintech_os/presentation/glass_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Golden for the GlassCard accessibility fallback (PRD §10A: solid surface
/// when transparency is disabled). Forcing disableAnimations keeps the render
/// deterministic (no blur), so the baseline is stable across machines.
void main() {
  testWidgets('GlassCard solid fallback golden', (tester) async {
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(disableAnimations: true),
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: ThemeData(useMaterial3: true),
          home: const Scaffold(
            body: Center(
              child: SizedBox(
                width: 300,
                child: GlassCard(
                  child: Text('Net Worth'),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(GlassCard),
      matchesGoldenFile('goldens/glass_card_fallback.png'),
    );
  });
}
