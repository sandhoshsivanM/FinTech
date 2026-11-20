// Android Back must never leave the app from anywhere but Home.
//
// A closed-test tester changed a notification time, pressed Back to return to
// Settings, and landed on the phone's home screen. Every destination was a
// sibling route reached with `go`, which replaces the stack, so Back had
// nothing to pop. This mirrors the router's shape (shell, `BackToHome`-wrapped
// tabs, Settings with a nested child) and drives the real system Back.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:khazana/core/router/app_router.dart';

GoRouter _router() {
  Page<void> tab(GoRouterState s, String label) => NoTransitionPage(
        key: s.pageKey,
        child: s.matchedLocation == Routes.dashboard
            ? Text(label)
            : BackToHome(child: Text(label)),
      );

  return GoRouter(
    initialLocation: Routes.dashboard,
    routes: [
      ShellRoute(
        builder: (context, state, child) => Scaffold(body: child),
        routes: [
          GoRoute(
            path: Routes.dashboard,
            pageBuilder: (c, s) => tab(s, 'home'),
          ),
          GoRoute(
            path: Routes.budget,
            pageBuilder: (c, s) => tab(s, 'budget'),
          ),
          GoRoute(
            path: Routes.settings,
            pageBuilder: (c, s) => tab(s, 'settings'),
            routes: [
              GoRoute(
                path: 'notifications',
                builder: (c, s) => const Text('notifications'),
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

void main() {
  late GoRouter router;

  Future<bool> pressBack(WidgetTester tester) async {
    final handled = await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    return handled;
  }

  setUp(() => router = _router());

  Future<void> start(WidgetTester tester, String location) async {
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    router.go(location);
    await tester.pumpAndSettle();
  }

  testWidgets('notifications → Back → Settings (not out of the app)',
      (tester) async {
    expect(Routes.notifications, '${Routes.settings}/notifications');
    await start(tester, Routes.notifications);
    expect(find.text('notifications'), findsOneWidget);

    expect(await pressBack(tester), isTrue, reason: 'app must not exit');
    expect(find.text('settings'), findsOneWidget);
    expect(find.text('notifications'), findsNothing);
  });

  testWidgets('Settings → Back → Home', (tester) async {
    await start(tester, Routes.settings);
    expect(await pressBack(tester), isTrue, reason: 'app must not exit');
    expect(find.text('home'), findsOneWidget);
  });

  testWidgets('a top-level tab → Back → Home', (tester) async {
    await start(tester, Routes.budget);
    expect(await pressBack(tester), isTrue, reason: 'app must not exit');
    expect(find.text('home'), findsOneWidget);
  });

  testWidgets('Home → Back leaves the app', (tester) async {
    await start(tester, Routes.dashboard);
    expect(await pressBack(tester), isFalse, reason: 'system handles exit');
  });
}
