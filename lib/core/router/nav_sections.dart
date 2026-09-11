import 'package:flutter/material.dart';

import 'app_router.dart';

/// The app's information architecture, in one place.
///
/// ── Why this shape ─────────────────────────────────────────────────────────
///
/// The previous structure was five flat tabs, the fifth of which ("More") held
/// twenty destinations in a scrolling list. That is a junk drawer: it puts
/// Accounts, which someone opens daily, at the same depth as Privacy, which
/// they open once — and it makes every secondary screen cost a tap, a scroll
/// and a read.
///
/// Sections fix that by nesting siblings under the parent they belong to.
/// Holdings sits inside Invest, Budget inside Money, reached by a segmented
/// control at the top of the screen rather than by a global menu. Nothing is
/// more than two taps from anywhere, and related screens sit together instead
/// of being alphabetised into a list.
///
/// Three things deliberately do NOT live here:
///
///   * [addTransaction] is the centre action in the bar. It is the single most
///     frequent thing anyone does in this app, and a primary action belongs in
///     the chrome, not in a menu.
///   * Settings, Pro, Import and the capture inbox are account-level, not
///     navigation. They hang off the avatar in the app bar, which is where
///     every app of this kind puts them. Mixing them into the main nav is what
///     made the old list twenty items long.
///   * Sub-pages reached from their own parent screen (add-lot, import-lots,
///     the settings sub-pages) are not destinations.
@immutable
class NavSection {
  const NavSection({
    required this.route,
    required this.label,
    required this.icon,
    required this.activeIcon,
    this.children = const [],
  });

  /// The bottom-bar destination, and the section's default screen.
  final String route;
  final String label;
  final IconData icon;
  final IconData activeIcon;

  /// Siblings shown as a segmented control at the top of the section. Empty
  /// means the section is a single screen and renders no sub-nav.
  final List<NavChild> children;

  /// Every route this section owns, the default screen included, each once.
  ///
  /// De-duplicated because the landing route is normally also the first child:
  /// Money's default screen IS Activity, and listing it twice would make the
  /// duplicate check in `navigation_test.dart` fail on a structure that is
  /// perfectly correct.
  List<String> get routes => {route, ...children.map((c) => c.route)}.toList();
}

@immutable
class NavChild {
  const NavChild(this.route, this.label);
  final String route;

  /// Kept short on purpose — these sit in a horizontal strip on a 390pt screen,
  /// and "Transactions" in a five-up segmented control wraps or truncates.
  final String label;
}

/// The four sections, in bar order.
///
/// Four, not five: an odd count leaves no centre slot, and the centre slot is
/// where the primary action goes. The order is roughly by frequency — Home and
/// Money are daily, Invest is weekly, Health is monthly.
const navSections = <NavSection>[
  NavSection(
    route: Routes.dashboard,
    label: 'Home',
    icon: Icons.home_outlined,
    activeIcon: Icons.home_rounded,
  ),
  NavSection(
    route: Routes.transactions,
    label: 'Money',
    icon: Icons.swap_horiz_outlined,
    activeIcon: Icons.swap_horiz_rounded,
    children: [
      NavChild(Routes.transactions, 'Activity'),
      NavChild(Routes.calendar, 'Calendar'),
      NavChild(Routes.budget, 'Budget'),
      NavChild(Routes.recurring, 'Recurring'),
      NavChild(Routes.accounts, 'Accounts'),
    ],
  ),
  NavSection(
    route: Routes.investments,
    label: 'Invest',
    icon: Icons.trending_up_outlined,
    activeIcon: Icons.trending_up_rounded,
    children: [
      NavChild(Routes.investments, 'Portfolio'),
      NavChild(Routes.investmentsBreakdown, 'Holdings'),
      NavChild(Routes.goals, 'Goals'),
      NavChild(Routes.liabilities, 'Debts'),
      NavChild(Routes.insurance, 'Cover'),
    ],
  ),
  NavSection(
    route: Routes.score,
    label: 'Health',
    icon: Icons.speed_outlined,
    activeIcon: Icons.speed_rounded,
    children: [
      NavChild(Routes.score, 'Score'),
      NavChild(Routes.reports, 'Reports'),
      NavChild(Routes.analytics, 'Analytics'),
      NavChild(Routes.safetyNet, 'Safety Net'),
    ],
  ),
];

/// Account-level destinations, behind the app-bar avatar.
///
/// These are things you do TO the vault rather than screens you read, which is
/// why they are not in the bar. Search is here because it is invoked, not
/// browsed — it has no resting state to navigate back to.
const avatarMenu = <({String route, IconData icon, String label})>[
  (route: Routes.search, icon: Icons.search, label: 'Search'),
  (
    route: Routes.captureInbox,
    icon: Icons.auto_awesome_motion_outlined,
    label: 'Auto-capture',
  ),
  (route: Routes.bankImport, icon: Icons.upload_outlined, label: 'Import'),
  (route: Routes.pro, icon: Icons.auto_awesome, label: 'Khazana Pro'),
  (route: Routes.settings, icon: Icons.settings_outlined, label: 'Settings'),
];

/// The section that owns a route, or null when nothing does.
NavSection? sectionFor(String route) {
  for (final s in navSections) {
    if (s.routes.contains(route)) return s;
  }
  return null;
}

/// Every route reachable from the bar, a section's sub-nav, or the avatar menu.
///
/// `test/widget/navigation_test.dart` asserts no screen falls outside this —
/// the guarantee the old structure lacked, which is how Accounts and Analytics
/// came to exist with no way in.
List<String> get phoneReachableRoutes => [
      for (final s in navSections) ...s.routes,
      for (final m in avatarMenu) m.route,
      // The centre action in the bar.
      Routes.addTransaction,
    ];
