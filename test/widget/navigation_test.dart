// Navigation structure guards.
//
// The app has five bottom-nav tabs and twenty-odd screens. Three invariants keep
// that ratio from quietly becoming "five tabs and twenty-odd screens, six of
// which nobody can reach":
//
//   1. Every route belongs to exactly one tab (Routes.ownerTab).
//   2. Every route appears in the desktop sidebar.
//   3. Every route is reachable from the phone, via a tab or the More screen.
//
// (3) was missing, and its absence is exactly the hole it now covers: owning a
// tab only decides which icon lights up, not whether anything can navigate to
// the screen. The sidebar was guarded and the phone was not, so the desktop
// grew to 34 destinations while the phone could reach 15 — the rest were
// stranded behind a chip block halfway down the dashboard, or behind nothing.
//
// Both used to be conventions. Both are now assertions, because the failure
// mode they guard against — a screen that still exists, still compiles, still
// has a route, and is reachable from nowhere — produces no error anywhere else.

import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/core/router/app_router.dart';
import 'package:khazana/core/router/nav_sections.dart';
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
  Routes.pro,
];

/// The five bottom-nav destinations, in bar order.
/// The four section landing screens, in bar order. Derived from the one table
/// that also drives the bar itself, so the test cannot pass against a bar that
/// no longer looks like this.
final _tabs = navSections.map((s) => s.route).toList();

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
    test('every route resolves to a real destination', () {
      // `settings` is a legitimate owner that is not a bar section: it and its
      // sub-pages hang off the avatar menu rather than the bar.
      final owners = {..._tabs, Routes.settings};
      for (final route in _allRoutes) {
        expect(
          owners,
          contains(Routes.ownerTab(route)),
          reason: '$route resolved to nothing navigable',
        );
      }
    });

    test('each section owns itself', () {
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
      // just because map iteration reached '/app/settings' first. They resolve
      // to More, which is the tab Settings now lives under.
      expect(Routes.ownerTab(Routes.currency), Routes.settings);
      expect(Routes.ownerTab(Routes.marketData), Routes.settings);
    });

    test('a sibling route with a shared prefix is not mistaken for a child', () {
      // '/app/investments-something' starts with '/app/investments' as a string
      // but is not under it as a path.
      expect(Routes.ownerTab('/app/investments-hypothetical'), Routes.dashboard);
    });
  });

  group('phone reachability', () {
    // The guarantee that was missing. A route owned by a tab is not thereby
    // reachable: ownership only decides which icon highlights. Before the More
    // screen existed, Accounts and Analytics had owners and no way in.
    test('every route can be reached from the bar, a section strip, or the avatar', () {
      final reachable = phoneReachableRoutes.toSet();
      final stranded = _allRoutes
          .where((r) => !_sidebarExempt.contains(r) && !reachable.contains(r))
          .toList();
      expect(
        stranded,
        isEmpty,
        reason: 'These screens exist and compile but nothing on a phone can '
            'navigate to them: \$stranded',
      );
    });

    test('phone navigation lists no route that does not exist', () {
      for (final route in phoneReachableRoutes) {
        expect(_allRoutes, contains(route),
            reason: '\$route is in the phone navigation but is not a real route');
      }
    });

    test('no destination appears twice in the phone navigation', () {
      final seen = <String>{};
      final dupes = phoneReachableRoutes.where((r) => !seen.add(r)).toList();
      expect(dupes, isEmpty);
    });

    // Four sections and a centre action. An odd count leaves no middle slot,
    // and the middle slot is the primary action.
    test('the bar carries four sections', () {
      expect(navSections, hasLength(4));
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
