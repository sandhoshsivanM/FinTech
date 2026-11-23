import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/budget/screens/budget_screen.dart';
import '../../features/calendar/screens/calendar_ledger_screen.dart';
import '../../features/capture/screens/capture_inbox_screen.dart';
import '../../features/goals/screens/goals_screen.dart';
import '../../features/import/screens/bank_import_screen.dart';
import '../../features/insurance/screens/insurance_screen.dart';
import '../../features/investments/screens/add_lot_screen.dart';
import '../../features/investments/screens/import_lots_screen.dart';
import '../../features/investments/screens/add_sip_screen.dart';
import '../../features/investments/screens/allocation_screen.dart';
import '../../features/investments/screens/sips_screen.dart';
import '../../features/investments/screens/investments_screen.dart';
import '../../features/investments/screens/analytics_screen.dart';
import '../../features/investments/screens/portfolio_breakdown_screen.dart';
import '../../features/liabilities/screens/liabilities_screen.dart';
import '../../features/reports/screens/dashboard_screen.dart';
import '../../features/reports/screens/reports_screen.dart';
import '../../features/safety_net/screens/safety_net_screen.dart';
import '../../features/score/screens/score_screen.dart';
import 'package:khazana_domain/entities/sip.dart' show SipPlan;
import 'package:khazana_domain/entities/transaction.dart' show Txn, TxnType;
import '../../features/transactions/screens/add_transaction_screen.dart';
import '../../features/accounts/screens/accounts_screen.dart';
import '../../features/transactions/screens/recurring_screen.dart';
import '../../features/transactions/screens/search_screen.dart';
import '../../features/transactions/screens/transactions_screen.dart';
import '../../features/settings/screens/currency_settings_screen.dart';
import '../../features/settings/screens/notification_settings_screen.dart';
import '../../features/settings/screens/market_data_settings_screen.dart';
import '../../features/settings/screens/settings_screen.dart';
import '../../presentation/app_shell.dart';
import '../../presentation/unlock_gate_screen.dart';
import '../di/providers.dart';
import '../services/notification_providers.dart';
import '../security/vault_state.dart';

/// Routes. `/unlock` is the only location reachable while locked (PRD §3 gate).
abstract final class Routes {
  static const unlock = '/unlock';
  static const dashboard = '/app/dashboard';
  static const transactions = '/app/transactions';
  static const addTransaction = '/app/transactions/add';
  static const editTransaction = '/app/transactions/edit';
  static const search = '/app/search';
  static const budget = '/app/budget';
  static const investments = '/app/investments';
  static const investmentsBreakdown = '/app/investments/breakdown';
  static const analytics = '/app/investments/analytics';
  static const investmentsAddLot = '/app/investments/add-lot';
  static const investmentsImportLots = '/app/investments/import-lots';
  static const investmentsAllocation = '/app/investments/allocation';
  static const investmentsSips = '/app/investments/sips';
  static const investmentsAddSip = '/app/investments/sips/add';
  static const liabilities = '/app/liabilities';
  static const insurance = '/app/insurance';
  static const safetyNet = '/app/safety-net';
  static const goals = '/app/goals';
  static const reports = '/app/reports';
  static const score = '/app/score';
  static const bankImport = '/app/import/bank';
  static const accounts = '/app/accounts';
  static const recurring = '/app/recurring';
  static const captureInbox = '/app/capture';
  static const calendar = '/app/calendar';
  static const marketData = '/app/settings/market-data';
  static const currency = '/app/settings/currency';
  static const notifications = '/app/settings/notifications';
  static const settings = '/app/settings';

  /// Which bottom-nav tab "owns" [location] — i.e. which tab should read as
  /// selected while this screen is open.
  ///
  /// The app has five tabs and twenty-two screens, so most locations are not a
  /// tab. The shell used to resolve this with a `startsWith` scan that fell back
  /// to index 0, which meant every one of those non-tab screens highlighted
  /// Dashboard — Budget, Goals, Liabilities and eight others all claimed to be
  /// the home screen. An explicit map is the only honest answer, because the
  /// relationship it encodes ("Reports lives under Score") is a product
  /// decision, not something a prefix can derive.
  static String ownerTab(String location) {
    for (final entry in _tabOwners.entries) {
      if (location == entry.key || location.startsWith('${entry.key}/')) {
        return entry.value;
      }
    }
    return dashboard;
  }

  /// Longest paths first, so `/app/settings/currency` is not swallowed by
  /// `/app/settings`.
  /// Kept for the desktop shell and for tests. On the phone the bar is driven
  /// by `nav_sections.dart` directly — a second hand-maintained map of the same
  /// relationships is how the two drifted apart in the first place.
  static final _tabOwners = <String, String>{
    reports: score,
    safetyNet: score,
    analytics: score,
    score: score,
    addTransaction: transactions,
    budget: transactions,
    calendar: transactions,
    accounts: transactions,
    recurring: transactions,
    search: transactions,
    captureInbox: transactions,
    bankImport: transactions,
    transactions: transactions,
    investmentsBreakdown: investments,
    investmentsAddLot: investments,
    investmentsImportLots: investments,
    liabilities: investments,
    insurance: investments,
    goals: investments,
    investments: investments,
    marketData: settings,
    currency: settings,
    notifications: settings,
    settings: settings,
    dashboard: dashboard,
  };
}

/// go_router driven by [vaultUnlockProvider]. Redirects every `/app/*` route to
/// `/unlock` unless the vault is unlocked, and re-locks on app backgrounding.
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<VaultState>(ref.read(vaultUnlockProvider));
  ref.onDispose(refresh.dispose);
  ref.listen<VaultState>(
    vaultUnlockProvider,
    (_, next) => refresh.value = next,
  );

  // A notification tap sets a destination and waits. Merged into the refresh
  // listenable so a tap while the app is already open re-runs the redirect
  // instead of sitting there until something else navigates.
  final deepLink = ref.read(notificationServiceProvider).pendingDeepLink;

  /// Takes the pending destination, if there is one, exactly once.
  ///
  /// A tap always arrives at `/unlock` when the vault is locked, which is most
  /// of the time — the app locks on backgrounding. Without somewhere to park the
  /// destination across the PIN screen, every notification tap ended on the
  /// dashboard, which is the one screen it was never about.
  String? takeDeepLink() {
    final route = deepLink.value;
    if (route == null || !route.startsWith('/app/')) return null;
    deepLink.value = null;
    return route;
  }

  return GoRouter(
    initialLocation: Routes.unlock,
    refreshListenable: Listenable.merge([refresh, deepLink]),
    redirect: (context, state) {
      final unlocked = ref.read(vaultUnlockProvider) is VaultUnlocked;
      final atGate = state.matchedLocation == Routes.unlock;
      // Locked: hold the destination rather than dropping it. It is consumed
      // below, on the redirect that follows a successful unlock.
      if (!unlocked) return atGate ? null : Routes.unlock;
      if (atGate) return takeDeepLink() ?? Routes.dashboard;
      final pending = takeDeepLink();
      if (pending != null && pending != state.matchedLocation) return pending;
      return null;
    },
    routes: [
      GoRoute(
        path: Routes.unlock,
        builder: (context, state) => const UnlockGateScreen(),
      ),
      // Authenticated shell with bottom navigation. Tab destinations use
      // NoTransitionPage so switching tabs is instant (no animation jank).
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          _tab(Routes.dashboard, const DashboardScreen()),
          _tab(
            Routes.transactions,
            const TransactionsScreen(),
            children: [
              GoRoute(
                path: 'add',
                // `?type=income` opens the form on Income — the home screen's
                // quick actions deep-link here.
                builder: (context, state) => AddTransactionScreen(
                  initialType: state.uri.queryParameters['type'] == 'income'
                      ? TxnType.income
                      : TxnType.expense,
                ),
              ),
              // Opened by tapping a transaction; the entry travels as `extra`.
              GoRoute(
                path: 'edit',
                builder: (context, state) => AddTransactionScreen(
                  editing: state.extra is Txn ? state.extra as Txn : null,
                ),
              ),
            ],
          ),
          _tab(Routes.search, const SearchScreen()),
          _tab(Routes.budget, const BudgetScreen()),
          _tab(
            Routes.investments,
            const InvestmentsScreen(),
            children: [
              GoRoute(
                path: 'breakdown',
                builder: (context, state) => const PortfolioBreakdownScreen(),
              ),
              GoRoute(
                path: 'analytics',
                builder: (context, state) => const AnalyticsScreen(),
              ),
              GoRoute(
                path: 'add-lot',
                builder: (context, state) => const AddLotScreen(),
              ),
              GoRoute(
                path: 'import-lots',
                builder: (context, state) => const ImportLotsScreen(),
              ),
              GoRoute(
                path: 'allocation',
                builder: (context, state) => const AllocationScreen(),
              ),
              GoRoute(
                path: 'sips',
                builder: (context, state) => const SipsScreen(),
                routes: [
                  // Also the edit screen: tapping a plan passes it as `extra`.
                  GoRoute(
                    path: 'add',
                    builder: (context, state) => AddSipScreen(
                      editing:
                          state.extra is SipPlan ? state.extra as SipPlan : null,
                    ),
                  ),
                ],
              ),
            ],
          ),
          _tab(Routes.liabilities, const LiabilitiesScreen()),
          _tab(Routes.insurance, const InsuranceScreen()),
          _tab(Routes.safetyNet, const SafetyNetScreen()),
          _tab(Routes.goals, const GoalsScreen()),
          _tab(Routes.reports, const ReportsScreen()),
          // No child routes: score category detail is disclosure in place.
          _tab(Routes.score, const ScoreScreen()),
          _tab(Routes.bankImport, const BankImportScreen()),
          _tab(Routes.accounts, const AccountsScreen()),
          _tab(Routes.recurring, const RecurringScreen()),
          _tab(Routes.captureInbox, const CaptureInboxScreen()),
          _tab(Routes.calendar, const CalendarLedgerScreen()),
          // Settings' own sub-screens are children, not siblings: `go` to a
          // child builds [settings, child], so Android Back returns to
          // Settings. As siblings, Back had nothing under it and left the app.
          _tab(
            Routes.settings,
            const SettingsScreen(),
            children: [
              GoRoute(
                path: 'market-data',
                builder: (context, state) => const MarketDataSettingsScreen(),
              ),
              GoRoute(
                path: 'currency',
                builder: (context, state) => const CurrencySettingsScreen(),
              ),
              GoRoute(
                path: 'notifications',
                builder: (context, state) =>
                    const NotificationSettingsScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

/// A bottom-nav destination route that swaps in with no transition animation
/// (instant tab switch — avoids per-switch jank).
///
/// Every destination except Home is wrapped in [BackToHome]. Navigation uses
/// `go`, which replaces the stack, so a top-level screen has nothing under it
/// and Android Back used to close the app from anywhere. Now Back goes Home,
/// and only Back on Home leaves.
GoRoute _tab(
  String path,
  Widget screen, {
  List<RouteBase> children = const [],
}) {
  return GoRoute(
    path: path,
    pageBuilder: (context, state) => NoTransitionPage(
      key: state.pageKey,
      child: path == Routes.dashboard ? screen : BackToHome(child: screen),
    ),
    routes: children,
  );
}

/// Turns system Back on a top-level screen into "go to Home".
///
/// Only affects the screen when it is the top of its navigator: a pushed child
/// (Add transaction, a Settings sub-screen) is above it and pops normally.
class BackToHome extends StatelessWidget {
  const BackToHome({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go(Routes.dashboard);
      },
      child: child,
    );
  }
}
