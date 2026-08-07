// Navigation structure guards.
//
// The app has five bottom-nav tabs and twenty-two screens. Two invariants keep
// that ratio from quietly becoming "five tabs and twenty-two screens, six of
// which nobody can reach":
//
//   1. Every route belongs to exactly one tab (Routes.ownerTab).
//   2. Every route appears in the desktop sidebar.
//
// Both used to be conventions. Both are now assertions, because the failure
// mode they guard against — a screen that still exists, still compiles, still
// has a route, and is reachable from nowhere — produces no error anywhere else.

import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/core/router/app_router.dart';
import 'package:khazana/presentation/desktop_shell.dart';

/// Every navigable location in the app.
const _allRoutes = <String>[
  Routes.dashboard,
  Routes.transactions,
  Routes.addTransaction,
  Routes.search,
  Routes.budget,
  Routes.investments,
  Routes.investmentsBreakdown,
  Routes.analytics,
  Routes.investmentsAddLot,
  Routes.investmentsImportLots,
  Routes.liabilities,
  Routes.insurance,
  Routes.safetyNet,
  Routes.goals,
  Routes.reports,
  Routes.score,
  Routes.bankImport,
  Routes.accounts,
  Routes.recurring,
  Routes.captureInbox,
  Routes.calendar,
  Routes.marketData,
  Routes.currency,
  Routes.settings,
];

/// The five bottom-nav destinations, in bar order.
const _tabs = <String>[
  Routes.dashboard,
  Routes.transactions,
  Routes.investments,
  Routes.score,
  Routes.settings,
];

/// Routes that legitimately have no sidebar row of their own: each is a form or
/// sub-page reached from its parent's screen, and listing them would turn a
/// 17-row sidebar into a 22-row one that buries the destinations that matter.
///
/// This list is the only permitted escape hatch. Adding a *screen* here rather
/// than a sub-page is how the guarantee gets hollowed out.
const _sidebarExempt = <String>[
  Routes.addTransaction,
  Routes.investmentsAddLot,
  Routes.investmentsImportLots,
  Routes.marketData,
  Routes.currency,
];

void main() {
  group('Routes.ownerTab', () {
    test('every route resolves to one of the five tabs', () {
      for (final route in _allRoutes) {
        expect(
          _tabs,
          contains(Routes.ownerTab(route)),
          reason: '$route resolved to a tab that is not on the bar',
        );
      }
    });

    test('each tab owns itself', () {
      for (final tab in _tabs) {
        expect(Routes.ownerTab(tab), tab);
      }
    });

    test('Reports and Safety Net live under Score, not Dashboard', () {
      // The regression this guards: the old prefix scan fell back to index 0,
      // so every non-tab screen highlighted Dashboard.
      expect(Routes.ownerTab(Routes.reports), Routes.score);
      expect(Routes.ownerTab(Routes.safetyNet), Routes.score);
    });

    test('money screens live under Transactions', () {
      expect(Routes.ownerTab(Routes.budget), Routes.transactions);
      expect(Routes.ownerTab(Routes.calendar), Routes.transactions);
      expect(Routes.ownerTab(Routes.recurring), Routes.transactions);
      expect(Routes.ownerTab(Routes.captureInbox), Routes.transactions);
      expect(Routes.ownerTab(Routes.search), Routes.transactions);
      expect(Routes.ownerTab(Routes.bankImport), Routes.transactions);
      expect(Routes.ownerTab(Routes.addTransaction), Routes.transactions);
    });

    test('balance-sheet screens live under Investments', () {
      expect(Routes.ownerTab(Routes.liabilities), Routes.investments);
      expect(Routes.ownerTab(Routes.insurance), Routes.investments);
      expect(Routes.ownerTab(Routes.goals), Routes.investments);
      expect(Routes.ownerTab(Routes.investmentsBreakdown), Routes.investments);
    });

    test('settings sub-pages are not swallowed by a shorter prefix', () {
      // '/app/settings/currency' must not fall through to some earlier entry
      // just because map iteration reached '/app/settings' first.
      expect(Routes.ownerTab(Routes.currency), Routes.settings);
      expect(Routes.ownerTab(Routes.marketData), Routes.settings);
    });

    test('a sibling route with a shared prefix is not mistaken for a child', () {
      // '/app/investments-something' starts with '/app/investments' as a string
      // but is not under it as a path.
      expect(Routes.ownerTab('/app/investments-hypothetical'), Routes.dashboard);
    });
  });

  group('desktop sidebar', () {
    test('lists every route except the explicit sub-page exemptions', () {
      final listed = desktopSidebarRoutes.toSet();
      final missing = _allRoutes
          .where((r) => !_sidebarExempt.contains(r) && !listed.contains(r))
          .toList();
      expect(
        missing,
        isEmpty,
        reason: 'These screens exist but have no sidebar entry, so on desktop '
            'they are reachable only by typing a URL: $missing',
      );
    });

    test('lists no route that does not exist', () {
      for (final route in desktopSidebarRoutes) {
        expect(_allRoutes, contains(route),
            reason: '$route is in the sidebar but is not a real route');
      }
    });

    test('has no duplicate entries', () {
      final seen = <String>{};
      final dupes =
          desktopSidebarRoutes.where((r) => !seen.add(r)).toList();
      expect(dupes, isEmpty);
    });
  });
}
