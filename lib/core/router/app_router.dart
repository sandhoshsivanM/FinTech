import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/budget/screens/budget_screen.dart';
import '../../features/goals/screens/goals_screen.dart';
import '../../features/import/screens/bank_import_screen.dart';
import '../../features/investments/screens/investments_screen.dart';
import '../../features/liabilities/screens/liabilities_screen.dart';
import '../../features/reports/screens/dashboard_screen.dart';
import '../../features/transactions/screens/add_transaction_screen.dart';
import '../../features/transactions/screens/recurring_screen.dart';
import '../../features/transactions/screens/search_screen.dart';
import '../../features/transactions/screens/transactions_screen.dart';
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
  static const goals = '/app/goals';
  static const bankImport = '/app/import/bank';
  static const recurring = '/app/recurring';
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
      // Authenticated shell with bottom navigation.
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(
            path: Routes.dashboard,
            builder: (context, state) => const DashboardScreen(),
          ),
          GoRoute(
            path: Routes.transactions,
            builder: (context, state) => const TransactionsScreen(),
            routes: [
              GoRoute(
                path: 'add',
                builder: (context, state) => const AddTransactionScreen(),
              ),
            ],
          ),
          GoRoute(
            path: Routes.search,
            builder: (context, state) => const SearchScreen(),
          ),
          GoRoute(
            path: Routes.budget,
            builder: (context, state) => const BudgetScreen(),
          ),
          GoRoute(
            path: Routes.investments,
            builder: (context, state) => const InvestmentsScreen(),
          ),
          GoRoute(
            path: Routes.liabilities,
            builder: (context, state) => const LiabilitiesScreen(),
          ),
          GoRoute(
            path: Routes.goals,
            builder: (context, state) => const GoalsScreen(),
          ),
          GoRoute(
            path: Routes.bankImport,
            builder: (context, state) => const BankImportScreen(),
          ),
          GoRoute(
            path: Routes.recurring,
            builder: (context, state) => const RecurringScreen(),
          ),
          GoRoute(
            path: Routes.settings,
            builder: (context, state) => const SettingsScreen(),
          ),
        ],
      ),
    ],
  );
});
