import 'package:flutter/material.dart';

import '../../core/theme/app_tokens.dart';
import 'widgets/balance_hero.dart';
import 'widgets/budget_ring_card.dart';
import 'widgets/entrance.dart';
import 'widgets/insight_card.dart';
import 'widgets/latest_transactions.dart';
import 'widgets/month_tiles.dart';
import 'widgets/quick_actions.dart';
import 'widgets/wallet_stack.dart';
import 'widgets/week_flow_card.dart';

/// The home's header: the one number and the four round shortcuts.
class HomeHeader extends StatelessWidget {
  const HomeHeader({super.key});

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.xs,
        AppSpacing.sm,
        AppSpacing.xs,
        AppSpacing.lg,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Entrance(child: BalanceHero()),
          SizedBox(height: AppSpacing.xl),
          QuickActions(),
        ],
      ),
    );
  }
}

/// What follows the header, in order: wallet, the last 7 days, budget and the
/// latest activity. The rest of the dashboard follows it in the same sheet.
class HomeSheetContent extends StatelessWidget {
  const HomeSheetContent({super.key});

  @override
  Widget build(BuildContext context) {
    const gap = SizedBox(height: AppSpacing.xl);
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Entrance(order: 1, child: MonthTiles()),
        SizedBox(height: AppSpacing.xl),
        Entrance(order: 1, child: WalletStack()),
        gap,
        Entrance(order: 2, child: WeekFlowCard()),
        SizedBox(height: AppSpacing.md),
        Entrance(order: 3, child: InsightCard()),
        SizedBox(height: AppSpacing.md),
        Entrance(order: 3, child: BudgetRingCard()),
        SizedBox(height: AppSpacing.md),
        Entrance(order: 4, child: LatestTransactions()),
        gap,
      ],
    );
  }
}
