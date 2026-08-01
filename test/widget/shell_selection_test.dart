import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:khazana/core/router/app_router.dart';
import 'package:khazana/features/capture/providers/capture_providers.dart';
import 'package:khazana/presentation/app_shell.dart';
import 'package:khazana/presentation/desktop_shell.dart';

/// Which shell each platform gets.
///
/// The rule is that macOS, Windows and Linux get the sidebar and everything
/// else gets the bottom bar — and it is keyed on the PLATFORM, not the window
/// width, so a narrow window on a Mac is still a Mac app.
///
/// Worth a test because the failure is silent: a desktop build that renders the
/// phone shell still works, it just looks like a stretched phone app, which is
/// exactly the complaint that prompted this file.
void main() {
  /// Pumps AppShell inside a router, since it reads GoRouterState.
  Future<void> pumpShell(WidgetTester tester) async {
    final router = GoRouter(
      initialLocation: Routes.dashboard,
      routes: [
        ShellRoute(
          builder: (context, state, child) => AppShell(child: child),
          routes: [
            GoRoute(
              path: Routes.dashboard,
              builder: (context, state) => const Text('dash'),
            ),
          ],
        ),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          // AppShell starts the SMS/notification capture stream, which needs an
          // unlocked vault. Not what this test is about.
          captureListenerProvider.overrideWithValue(null),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// Runs [body] as [platform].
  ///
  /// The override has to be cleared before the body returns: the test framework
  /// asserts all foundation debug variables are unset at that point, so a
  /// `tearDown` runs too late.
  Future<void> asPlatform(TargetPlatform platform, Future<void> Function() body) async {
    debugDefaultTargetPlatformOverride = platform;
    try {
      await body();
    } finally {
      debugDefaultTargetPlatformOverride = null;
    }
  }

  group('isDesktopPlatform', () {
    test('is true for the three desktop platforms', () {
      for (final p in [
        TargetPlatform.macOS,
        TargetPlatform.windows,
        TargetPlatform.linux,
      ]) {
        debugDefaultTargetPlatformOverride = p;
        expect(isDesktopPlatform, isTrue, reason: '$p should be desktop');
      }
      debugDefaultTargetPlatformOverride = null;
    });

    test('is false for the mobile platforms', () {
      for (final p in [TargetPlatform.android, TargetPlatform.iOS]) {
        debugDefaultTargetPlatformOverride = p;
        expect(isDesktopPlatform, isFalse, reason: '$p should not be desktop');
      }
      debugDefaultTargetPlatformOverride = null;
    });
  });

  group('shell selection', () {
    testWidgets('macOS renders the sidebar, not the bottom bar', (tester) async {
      tester.view.physicalSize = const Size(1400, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await asPlatform(TargetPlatform.macOS, () async {
        await pumpShell(tester);
        expect(find.byType(DesktopShell), findsOneWidget,
            reason: 'a Mac build showing the phone shell is a stretched phone '
                'app, which is the complaint this guards');
        expect(find.byType(NavigationBar), findsNothing);
      });
    });

    testWidgets('a narrow Mac window still gets the sidebar', (tester) async {
      // The documented rule: keyed on platform, not width.
      tester.view.physicalSize = const Size(700, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await asPlatform(TargetPlatform.macOS, () async {
        await pumpShell(tester);
        expect(find.byType(DesktopShell), findsOneWidget);
      });
    });

    testWidgets('Android renders the bottom bar, not the sidebar',
        (tester) async {
      tester.view.physicalSize = const Size(400, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await asPlatform(TargetPlatform.android, () async {
        await pumpShell(tester);
        expect(find.byType(NavigationBar), findsOneWidget);
        expect(find.byType(DesktopShell), findsNothing);
      });
    });

    testWidgets('a wide Android tablet still gets the bottom bar',
        (tester) async {
      tester.view.physicalSize = const Size(1600, 1000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await asPlatform(TargetPlatform.android, () async {
        await pumpShell(tester);
        expect(find.byType(NavigationBar), findsOneWidget,
            reason: 'a tablet still wants touch targets');
      });
    });
  });
}
