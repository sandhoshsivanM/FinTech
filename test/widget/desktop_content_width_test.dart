import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:khazana/core/router/app_router.dart';
import 'package:khazana/core/router/layout_providers.dart';
import 'package:khazana/presentation/desktop_shell.dart';

/// The desktop shell used to hand each screen the full window width, on the
/// reasoning that a desktop app should use its window. But every screen is a
/// mobile-first column, so "using the width" meant stretching each list row
/// across the whole window: the label at the far left, its amount at the far
/// right, and a metre of blank canvas between them. That is what made Recurring,
/// Liabilities, Import and Insurance read as loose text rather than as a
/// financial UI.
///
/// These tests pin the resulting rule so a future change cannot quietly undo it.
void main() {
  /// Renders [route] in the desktop shell at [windowWidth] and returns the width
  /// actually handed to the screen.
  Future<double> contentWidth(
    WidgetTester tester, {
    required String route,
    double windowWidth = 1600,
    List<Override> overrides = const [],
  }) async {
    const probeKey = Key('probe');
    late double measured;

    final router = GoRouter(
      initialLocation: route,
      routes: [
        ShellRoute(
          builder: (context, state, child) => DesktopShell(child: child),
          routes: [
            for (final r in desktopSidebarRoutes)
              GoRoute(
                path: r,
                builder: (context, state) => LayoutBuilder(
                  key: r == route ? probeKey : null,
                  builder: (context, c) {
                    measured = c.maxWidth;
                    return const SizedBox.expand();
                  },
                ),
              ),
          ],
        ),
      ],
    );
    addTearDown(router.dispose);

    tester.view.physicalSize = Size(windowWidth, 1000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
    return measured;
  }

  group('list and form screens get a readable column', () {
    for (final route in [
      Routes.recurring,
      Routes.liabilities,
      Routes.insurance,
      Routes.goals,
      Routes.budget,
      Routes.settings,
    ]) {
      testWidgets('$route is capped, not stretched', (tester) async {
        final width = await contentWidth(tester, route: route);
        expect(
          width,
          lessThanOrEqualTo(900),
          reason: '$route is a list; a 1600px row cannot be read as one row',
        );
      });
    }
  });

  group('multi-column dashboards keep their width', () {
    for (final route in [
      Routes.dashboard,
      Routes.investments,
      Routes.calendar,
      Routes.reports,
    ]) {
      testWidgets('$route stays wide', (tester) async {
        final width = await contentWidth(tester, route: route);
        expect(
          width,
          greaterThan(1000),
          reason: '$route lays out real columns and needs the room',
        );
      });
    }
  });

  testWidgets('a stuck wideLayout flag cannot un-cap a list screen',
      (tester) async {
    // `wideLayoutProvider` is the mobile shell's opt-in, set on mount and
    // cleared on dispose. Those do not reliably interleave: leaving the
    // calendar can leave it stuck true. When the desktop shell honoured it,
    // that one stale bool silently restored full-width rows on every screen
    // visited afterwards — and did so only at runtime, so the fix looked
    // deployed and wasn't.
    final width = await contentWidth(
      tester,
      route: Routes.liabilities,
      overrides: [wideLayoutProvider.overrideWith((ref) => true)],
    );
    expect(width, lessThanOrEqualTo(900));
  });

  testWidgets('a narrow window is never padded below its own width',
      (tester) async {
    // The cap is a ceiling, not a fixed width. On a small window the content
    // must still fill it rather than sit in a letterboxed column.
    final width =
        await contentWidth(tester, route: Routes.recurring, windowWidth: 900);
    expect(width, greaterThan(600));
    expect(width, lessThan(900));
  });
}
