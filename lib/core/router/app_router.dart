import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/budget/screens/budget_screen.dart';
import '../../features/calendar/screens/calendar_ledger_screen.dart';
import '../../features/capture/screens/capture_inbox_screen.dart';
import '../../features/goals/screens/goals_screen.dart';
import '../../features/import/screens/bank_import_screen.dart';
import '../../features/insurance/screens/insurance_screen.dart';
import '../../features/investments/screens/investments_screen.dart';
import '../../features/liabilities/screens/liabilities_screen.dart';
import '../../features/reports/screens/dashboard_screen.dart';
import '../../features/reports/screens/reports_screen.dart';
import '../../features/safety_net/screens/safety_net_screen.dart';
import '../../features/transactions/screens/add_transaction_screen.dart';
import '../../features/transactions/screens/recurring_screen.dart';
import '../../features/transactions/screens/search_screen.dart';
import '../../features/transactions/screens/transactions_screen.dart';
import '../../features/settings/screens/currency_settings_screen.dart';
import '../../features/settings/screens/market_data_settings_screen.dart';
import '../../features/settings/screens/settings_screen.dart';
import '../../presentation/app_shell.dart';
import '../../presentation/unlock_gate_screen.dart';
import '../di/providers.dart';
import '../security/vault_state.dart';

/// Routes. `/unlock` is the only location reachable while locked (PRD §3 gate).
abstract final class Routes {
  static const unlock = '/unlock';
  static const dashboard = '/app/dashboard';
  static const transactions = '/app/transactions';
  static const addTransaction = '/app/transactions/add';
  static const search = '/app/search';
  static const budget = '/app/budget';
  static const investments = '/app/investments';
  static const liabilities = '/app/liabilities';
  static const insurance = '/app/insurance';
  static const safetyNet = '/app/safety-net';
  static const goals = '/app/goals';
  static const reports = '/app/reports';
  static const bankImport = '/app/import/bank';
  static const recurring = '/app/recurring';
  static const captureInbox = '/app/capture';
  static const calendar = '/app/calendar';
  static const marketData = '/app/settings/market-data';
  static const currency = '/app/settings/currency';
  static const settings = '/app/settings';
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

  return GoRouter(
    initialLocation: Routes.unlock,
    refreshListenable: refresh,
    redirect: (context, state) {
      final unlocked = ref.read(vaultUnlockProvider) is VaultUnlocked;
      final atGate = state.matchedLocation == Routes.unlock;
      if (!unlocked) return atGate ? null : Routes.unlock;
      if (atGate) return Routes.dashboard;
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
          _tab(Routes.transactions, const TransactionsScreen(), children: [
            GoRoute(
              path: 'add',
              builder: (context, state) => const AddTransactionScreen(),
            ),
          ]),
          _tab(Routes.search, const SearchScreen()),
          _tab(Routes.budget, const BudgetScreen()),
          _tab(Routes.investments, const InvestmentsScreen()),
          _tab(Routes.liabilities, const LiabilitiesScreen()),
          _tab(Routes.insurance, const InsuranceScreen()),
          _tab(Routes.safetyNet, const SafetyNetScreen()),
          _tab(Routes.goals, const GoalsScreen()),
          _tab(Routes.reports, const ReportsScreen()),
          _tab(Routes.bankImport, const BankImportScreen()),
          _tab(Routes.recurring, const RecurringScreen()),
          _tab(Routes.captureInbox, const CaptureInboxScreen()),
          _tab(Routes.calendar, const CalendarLedgerScreen()),
          _tab(Routes.settings, const SettingsScreen()),
          _tab(Routes.marketData, const MarketDataSettingsScreen()),
          _tab(Routes.currency, const CurrencySettingsScreen()),
        ],
      ),
    ],
  );
});

/// A bottom-nav destination route that swaps in with no transition animation
/// (instant tab switch — avoids per-switch jank).
GoRoute _tab(String path, Widget screen, {List<RouteBase> children = const []}) {
  return GoRoute(
    path: path,
    pageBuilder: (context, state) =>
        NoTransitionPage(key: state.pageKey, child: screen),
    routes: children,
  );
}
