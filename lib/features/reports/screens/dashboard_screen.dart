import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';

import '../../../design_system/components/khazana_cards.dart';
import '../../../design_system/tokens/khazana_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../presentation/charts/donut_chart.dart';
import '../../../domain/entities/goal.dart';
import '../../goals/providers/goal_providers.dart';
import '../../../presentation/asset_group_colors.dart';
import '../../../domain/entities/asset_group.dart';
import '../../budget/providers/budget_providers.dart';
import '../../../domain/entities/investment_totals.dart';
import '../../../domain/entities/net_worth_snapshot.dart';
import '../../../domain/entities/recurring_rule.dart';
import '../../../domain/entities/transaction.dart';
import '../../../domain/services/financial_health.dart';
import '../../../domain/services/narrative_engine.dart';
import '../../../domain/services/net_worth_calculator.dart';
import '../../../domain/services/monthly_cash_flow.dart';
import '../../../presentation/charts/area_chart.dart';
import '../../../presentation/charts/bar_chart.dart';
import '../../../presentation/charts/gauge_chart.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/glass_card.dart';
import '../../../presentation/onboarding_banner.dart';
import '../../../presentation/stat_tile.dart';
import '../../../presentation/tour_overlay.dart';
import '../../investments/providers/portfolio_providers.dart';
import '../../liabilities/providers/liability_providers.dart';
import '../../transactions/providers/category_providers.dart';
import '../../transactions/providers/recurring_providers.dart';
import '../../transactions/providers/transaction_providers.dart';
import '../providers/dashboard_providers.dart';

// ---------------------------------------------------------------------------
// Screen root
// ---------------------------------------------------------------------------

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // Transparent so the global AppBackground gradient shows through.
      backgroundColor: Colors.transparent,
      body: const SafeArea(child: DataGate(child: _DashboardBody())),
    );
  }
}

// ---------------------------------------------------------------------------
// Body — error / loading guards then the full scrollable layout
// ---------------------------------------------------------------------------

class _DashboardBody extends ConsumerWidget {
  const _DashboardBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Materialize any due recurring transactions once the DB is ready (PRD §14).
    ref.watch(recurringProcessorProvider);
    // Capture today's net-worth snapshot for real trend history.
    ref.watch(snapshotCaptureProvider);

    final txnState = ref.watch(transactionListProvider);
    if (txnState is TransactionError) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: AppColors.expense),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Could not load data: ${txnState.message}',
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    final data = ref.watch(netWorthProvider);
    final window = ref.watch(selectedWindowProvider);

    if (data == null) {
      // Cold open: show the last stored snapshot rather than a spinner, and
      // label it. A number marked "as of yesterday" is useful; the same number
      // presented as live is the dishonesty this whole change removes.
      final cached = ref.watch(cachedNetWorthProvider);
      if (cached == null) {
        return const Center(child: CircularProgressIndicator());
      }
      return _ColdOpenPlaceholder(snapshot: cached);
    }

    return ListView(
      // Bottom pad clears the navigation bar. With a symmetric vertical pad the
      // final card ran underneath it and looked clipped.
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.md, AppSpacing.sm, AppSpacing.md, 96),
      children: [
        // 0. First-run guided tour launcher (shows once) + welcome banner.
        const TourLauncher(),
        const OnboardingBanner(),
        const SizedBox(height: AppSpacing.sm),

        // 1. Greeting header row.
        const _GreetingHeader(),
        const SizedBox(height: AppSpacing.md),

        // 2. Net-worth hero card.
        _NetWorthHeroCard(data: data),
        const SizedBox(height: AppSpacing.md),

        // 3. 2x2 stat tiles.
        _StatTilesGrid(summary: data.summary),
        const SizedBox(height: AppSpacing.md),

        // 4. Health score, then the single insight. Both sit above the trend
        //    chart: they answer "how am I doing" in one glance, which is what
        //    the first screenful is for. The trend is the second look.
        const _FinancialHealthCard(),
        const SizedBox(height: AppSpacing.md),

        const _InsightsCard(),
        const SizedBox(height: AppSpacing.md),

        // 4b. Window selector + net-worth trend, full width. The trend is the
        //     one series whose shape needs the whole width to be readable.
        _WindowSelector(
          selected: window,
          onChanged: (w) =>
              ref.read(selectedWindowProvider.notifier).state = w,
        ),
        const SizedBox(height: AppSpacing.sm),
        _TrendChart(series: ref.watch(dashboardTrendProvider)),
        const SizedBox(height: AppSpacing.md),

        // 4c. The grid. Every widget here is a CHART — a donut, a dial, a ring,
        //     a bar series — because a dashboard's job is to be read at a
        //     glance, and a ranked list of amounts has to be read line by line.
        //     Two columns on a wide window so several are visible at once,
        //     which is the difference between a dashboard and a long scroll.
        const _Masonry(children: [
          _CashFlowCard(),
          _TopSpendCard(),
          _BudgetPulseCard(),
          _AllocationMiniCard(),
          _GoalsCard(),
          _UpcomingBillsSection(),
        ]),

        // 5. Quick links to everything that is not a tab.
        const _QuickLinks(),
        const SizedBox(height: AppSpacing.md),

        // 6. Recent transactions — a list on purpose. These are individual
        //    events, not a distribution, and there is no chart of "the last
        //    five things that happened".
        const _RecentTransactionsSection(),
        const SizedBox(height: AppSpacing.lg),
      ],
    );
  }
}

/// What the Dashboard shows for the moment before the live figures resolve.
class _ColdOpenPlaceholder extends ConsumerWidget {
  const _ColdOpenPlaceholder({required this.snapshot});
  final NetWorthSnapshot snapshot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ghost = ref.watch(ghostModeProvider);
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final days = DateTime.now().difference(snapshot.date).inDays;

    return ListView(
      // Bottom pad clears the navigation bar. With a symmetric vertical pad the
      // final card ran underneath it and looked clipped.
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.md, AppSpacing.sm, AppSpacing.md, 96),
      children: [
        const _GreetingHeader(),
        const SizedBox(height: AppSpacing.md),
        GlassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Net worth',
                  style: text.labelMedium
                      ?.copyWith(color: scheme.onSurfaceVariant)),
              const SizedBox(height: AppSpacing.xs),
              Text(
                ghost ? '••••••' : Money.format(snapshot.netWorth),
                style: text.headlineMedium
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: AppSpacing.xs),
              Row(
                children: [
                  SizedBox(
                    width: 12,
                    height: 12,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: scheme.onSurfaceVariant),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Text(
                    days <= 0
                        ? 'As of earlier today · updating'
                        : 'As of ${days == 1 ? 'yesterday' : '$days days ago'} · updating',
                    style: text.labelSmall
                        ?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Quick links to features not on the bottom nav.
// ---------------------------------------------------------------------------

class _QuickLinks extends StatelessWidget {
  const _QuickLinks();
  @override
  Widget build(BuildContext context) {
    const links = [
      // Reports is not a tab any more (Score took its slot), so this chip and
      // the link on the Score screen are how it stays reachable on a phone.
      (Routes.reports, Icons.bar_chart_outlined, 'Reports'),
      (Routes.calendar, Icons.calendar_month_outlined, 'Calendar'),
      (Routes.captureInbox, Icons.auto_awesome_motion_outlined, 'Auto-capture'),
      (Routes.budget, Icons.pie_chart_outline, 'Budget'),
      (Routes.goals, Icons.flag_outlined, 'Goals'),
      (Routes.liabilities, Icons.credit_card_outlined, 'Liabilities'),
      (Routes.insurance, Icons.shield_outlined, 'Insurance'),
      (Routes.safetyNet, Icons.health_and_safety_outlined, 'Safety Net'),
      (Routes.recurring, Icons.repeat, 'Recurring'),
      (Routes.search, Icons.search, 'Search'),
    ];
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: [
        for (final l in links)
          ActionChip(
            avatar: Icon(l.$2, size: 17),
            label: Text(l.$3),
            onPressed: () => context.go(l.$1),
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// 1. Greeting header
// ---------------------------------------------------------------------------

class _GreetingHeader extends StatelessWidget {
  const _GreetingHeader();

  String _greeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Row(
      children: [
        Expanded(
          child: Row(
            children: [
              Text(
                _greeting(),
                style: textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppColors.lightOnSurface,
                ),
              ),
              const SizedBox(width: AppSpacing.xs),
            ],
          ),
        ),
        // Profile / notification icon button (min 48dp touch target).
        SizedBox(
          width: AppSpacing.minTouchTarget,
          height: AppSpacing.minTouchTarget,
          child: Tooltip(
            message: 'Settings',
            child: InkWell(
              borderRadius: BorderRadius.circular(AppRadii.pill),
              onTap: () => context.go(Routes.settings),
              child: Center(
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                    border: Border.all(
                        color: AppColors.accent.withValues(alpha: 0.25)),
                  ),
                  child: const Icon(Icons.person_outline,
                      color: AppColors.accent, size: 20),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Net-worth hero card
// ---------------------------------------------------------------------------

class _NetWorthHeroCard extends ConsumerWidget {
  const _NetWorthHeroCard({required this.data});
  final DashboardData data;

  /// Month-over-month change = income − expense for the current window.
  String _changeLabel(DashboardData data) {
    final net = data.summary.net;
    final income = data.summary.income;
    final sign = net >= Decimal.zero ? '+' : '';
    if (income == Decimal.zero) {
      return '$sign${Money.format(net)} this period';
    }
    // Savings rate as a percentage proxy for MoM change readability.
    final pct = (net.toDouble() / income.toDouble() * 100).toStringAsFixed(1);
    return '$sign${Money.format(net)} ($pct%) this period';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ghost = ref.watch(ghostModeProvider);

    final changeLabel = _changeLabel(data);
    final netPositive = data.summary.net >= Decimal.zero;

    return Semantics(
      label: ghost
          ? 'Net worth hidden. Tap eye icon to reveal.'
          : 'Total net worth ${Money.toWords(data.total)}',
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppRadii.card),
          // The single dark focal surface. A full-bleed emerald slab reads as
          // loud rather than premium, and it spends the interaction colour on
          // something that is not interactive.
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF14372A), KhazanaColors.forest],
          ),
          border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.35),
              blurRadius: 28,
              offset: const Offset(0, 14),
            ),
          ],
        ),
        child: ExcludeSemantics(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Label row + ghost-mode toggle.
              Row(
                children: [
                  const Icon(Icons.account_balance_wallet,
                      color: KhazanaColors.vaultGold, size: 16),
                  const SizedBox(width: AppSpacing.xs),
                  Text(
                    'NET WORTH',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: KhazanaColors.vaultGold,
                          letterSpacing: 1.4,
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                  const Spacer(),
                  // Eye toggle — ghost mode.
                  SizedBox(
                    width: AppSpacing.minTouchTarget,
                    height: AppSpacing.minTouchTarget,
                    child: Semantics(
                      button: true,
                      label: ghost ? 'Show amounts' : 'Hide amounts',
                      child: ExcludeSemantics(
                        child: IconButton(
                          padding: EdgeInsets.zero,
                          visualDensity: VisualDensity.compact,
                          icon: Icon(
                            ghost
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                            color: Colors.white70,
                            size: 20,
                          ),
                          tooltip: ghost ? 'Show amounts' : 'Hide amounts',
                          onPressed: () => ref
                              .read(ghostModeProvider.notifier)
                              .state = !ghost,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),

              // Big value.
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  ghost ? '••••••' : Money.format(data.total),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 38,
                    fontWeight: FontWeight.w800,
                    height: 1.0,
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.xs),

              // Change line.
              Row(
                children: [
                  Icon(
                    netPositive
                        ? Icons.arrow_upward_rounded
                        : Icons.arrow_downward_rounded,
                    color: netPositive
                        ? const Color(0xFF6EE7B7)
                        : const Color(0xFFFCA5A5),
                    size: 14,
                  ),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      ghost ? '••••••' : changeLabel,
                      style: TextStyle(
                        color: netPositive
                            ? const Color(0xFF6EE7B7)
                            : const Color(0xFFFCA5A5),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 3. 2x2 stat tiles grid
// ---------------------------------------------------------------------------

class _StatTilesGrid extends ConsumerWidget {
  const _StatTilesGrid({required this.summary});
  final WindowSummary summary;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ghost = ref.watch(ghostModeProvider);

    // Investments — from the one place the portfolio is valued, so this tile
    // and the Investments screen cannot disagree.
    final totals = ref.watch(investmentTotalsProvider);
    final investments = totals.whenData((t) => t.marketValue);

    // Liabilities — sum of principals.
    final liabilitiesAsync = ref.watch(liabilityListProvider);
    final liabilities = liabilitiesAsync.whenData(
      (list) =>
          list.fold<Decimal>(Decimal.zero, (s, l) => s + l.principal),
    );

    // Net cash = lifetime cash flow (income − expense across all txns).
    // For the window summary this is summary.net (or we use the whole-vault
    // total from netWorthProvider, but summary is passed in here).
    // We compute net cash (window) directly from summary.
    final netCash = summary.income - summary.expense;

    // Monthly savings rate as a plain double (avoids Rational arithmetic).
    final savingsRate = summary.income == Decimal.zero
        ? 0.0
        : (summary.income - summary.expense).toDouble() /
            summary.income.toDouble() *
            100.0;

    final rate = savingsRate.clamp(-999.0, 999.0);
    final rateColor = rate >= 0 ? AppColors.income : AppColors.expense;

    return Column(
      children: [
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
            Expanded(
              child: StatTile(
                label: 'Net Cash',
                value: Money.format(netCash),
                semanticValue: Money.toWords(netCash),
                icon: Icons.account_balance_wallet_outlined,
                iconColor: AppColors.accent,
                ghost: ghost,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: _AsyncMoneyTile(
                label: 'Investments',
                amount: investments,
                icon: Icons.trending_up_rounded,
                iconColor: AppColors.income,
                ghost: ghost,
                // How current this number is. Mutual-fund NAVs lag a day and
                // manually entered prices can be weeks old; a portfolio value
                // with no date implies a precision it does not have.
                footer: _pricingFooter(totals.valueOrNull),
                onTap: () => context.go(Routes.investments),
              ),
            ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
            Expanded(
              child: _AsyncMoneyTile(
                label: 'Liabilities',
                amount: liabilities,
                icon: Icons.credit_card_outlined,
                iconColor: AppColors.expense,
                ghost: ghost,
                onTap: () => context.go(Routes.liabilities),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: StatTile(
                label: 'Savings Rate',
                value: '${rate.toStringAsFixed(1)}%',
                semanticValue: '${rate.toStringAsFixed(1)} percent',
                icon: Icons.savings_outlined,
                iconColor: rateColor,
                valueColor: rateColor,
                ghost: ghost,
              ),
            ),
            ],
          ),
        ),
      ],
    );
  }
}

/// How current the portfolio value is, or null when there is nothing to date.
String? _pricingFooter(InvestmentTotals? t) {
  if (t == null || t.isEmpty) return null;
  if (t.unpricedCount > 0) {
    final n = t.unpricedCount;
    return '$n holding${n == 1 ? '' : 's'} at cost';
  }
  final at = t.lastPricedAt;
  if (at == null) return 'No prices recorded';
  final days = DateTime.now().difference(at).inDays;
  if (days <= 0) return 'Priced today';
  if (days == 1) return 'Priced yesterday';
  return 'Priced $days days ago';
}

class _AsyncMoneyTile extends StatelessWidget {
  const _AsyncMoneyTile({
    required this.label,
    required this.amount,
    required this.icon,
    required this.iconColor,
    required this.ghost,
    this.footer,
    this.onTap,
  });

  final String label;
  final AsyncValue<Decimal> amount;
  final IconData icon;
  final Color iconColor;
  final bool ghost;
  final String? footer;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    // Loading and error both render zero rather than a spinner: these tiles sit
    // in a fixed 2x2 grid, and swapping a spinner in and out reflows the whole
    // grid on every stream tick.
    final value = amount.valueOrNull ?? Decimal.zero;
    return StatTile(
      label: label,
      value: Money.format(value),
      semanticValue: Money.toWords(value),
      icon: icon,
      iconColor: iconColor,
      ghost: ghost,
      footer: footer,
      onTap: onTap,
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Window selector
// ---------------------------------------------------------------------------

class _WindowSelector extends StatelessWidget {
  const _WindowSelector({required this.selected, required this.onChanged});
  final TimeWindow selected;
  final ValueChanged<TimeWindow> onChanged;

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<TimeWindow>(
      segments: [
        for (final w in TimeWindow.values)
          ButtonSegment(value: w, label: Text(w.label)),
      ],
      selected: {selected},
      onSelectionChanged: (s) => onChanged(s.first),
    );
  }
}

// ---------------------------------------------------------------------------
// Trend chart (preserved from original, wrapped in GlassCard)
// ---------------------------------------------------------------------------

class _TrendChart extends StatelessWidget {
  const _TrendChart({required this.series});
  final List<NetWorthPoint> series;

  @override
  Widget build(BuildContext context) {
    // Downsample to ~60 points. Beyond that the extra vertices are sub-pixel
    // and cost paint time for nothing.
    final raw = series.map((p) => p.value.toDouble()).toList();
    final step = raw.isEmpty ? 1 : (raw.length / 60).ceil().clamp(1, raw.length);
    final pts = <double>[
      for (var i = 0; i < raw.length; i += step) raw[i],
    ];
    if (pts.isNotEmpty && pts.last != raw.last) pts.add(raw.last);

    return GlassCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: AreaChart(
        values: pts,
        height: 150,
        formatValue: (v) => Money.format(Decimal.parse(v.toStringAsFixed(2))),
        emptyLabel: 'Your net worth trend will appear here',
        semanticLabel: series.isEmpty
            ? null
            : 'Net worth trend over the selected period, '
                'ending at ${Money.toWords(series.last.value)}',
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Recent transactions section
// ---------------------------------------------------------------------------

class _RecentTransactionsSection extends ConsumerWidget {
  const _RecentTransactionsSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ghost = ref.watch(ghostModeProvider);
    final txnState = ref.watch(transactionListProvider);
    final categoriesAsync = ref.watch(categoryListProvider);

    final txns = txnState is TransactionData ? txnState.transactions : <Txn>[];
    // Sort by date descending, take latest 4.
    final recent = [...txns]
      ..sort((a, b) => b.date.compareTo(a.date));
    final slice = recent.take(4).toList();

    final categories = categoriesAsync.valueOrNull ?? [];
    final catMap = {for (final c in categories) c.id: c};

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(
          title: 'Recent Transactions',
          actionLabel: 'See all',
          onAction: () => context.go(Routes.transactions),
        ),
        const SizedBox(height: AppSpacing.sm),
        GlassCard(
          padding: EdgeInsets.zero,
          child: slice.isEmpty
              ? const Padding(
                  padding: EdgeInsets.all(AppSpacing.lg),
                  child: Center(
                    child: Text(
                      'No transactions yet',
                      style: TextStyle(color: Colors.grey),
                    ),
                  ),
                )
              : Column(
                  children: [
                    for (var i = 0; i < slice.length; i++) ...[
                      _TransactionRow(
                        txn: slice[i],
                        categoryName:
                            catMap[slice[i].categoryId]?.name,
                        categoryIconCodepoint:
                            catMap[slice[i].categoryId]?.iconCodepoint,
                        ghost: ghost,
                      ),
                      if (i < slice.length - 1)
                        const Divider(height: 1, indent: 60, endIndent: 16),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

class _TransactionRow extends StatelessWidget {
  const _TransactionRow({
    required this.txn,
    required this.ghost,
    this.categoryName,
    this.categoryIconCodepoint,
  });

  final Txn txn;
  final String? categoryName;
  final int? categoryIconCodepoint;
  final bool ghost;

  @override
  Widget build(BuildContext context) {
    final isIncome = txn.type == TxnType.income;
    final amountColor = isIncome ? AppColors.income : AppColors.expense;
    final signedStr = Money.formatSigned(txn.amount, isIncome: isIncome);

    final iconData = categoryIconCodepoint != null
        ? IconData(categoryIconCodepoint!, fontFamily: 'MaterialIcons')
        : (isIncome ? Icons.arrow_downward : Icons.arrow_upward);

    final label = txn.merchant ?? categoryName ?? (isIncome ? 'Income' : 'Expense');
    final dateStr = _formatDate(txn.date);

    return Semantics(
      label: ghost
          ? '$label on $dateStr, amount hidden'
          : '$label on $dateStr, ${Money.formatSigned(txn.amount, isIncome: isIncome)}',
      child: ExcludeSemantics(
        child: Padding(
          padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md, vertical: 10),
          child: Row(
            children: [
              // Category icon badge.
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: amountColor.withValues(alpha: 0.10),
                  shape: BoxShape.circle,
                ),
                child:
                    Icon(iconData, color: amountColor, size: 18),
              ),
              const SizedBox(width: AppSpacing.sm),
              // Name + date.
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.copyWith(fontWeight: FontWeight.w600),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      dateStr,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant,
                          ),
                    ),
                  ],
                ),
              ),
              // Signed amount.
              Text(
                ghost ? '••••••' : signedStr,
                style: TextStyle(
                  color: amountColor,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _formatDate(DateTime d) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${d.day} ${months[d.month - 1]}';
  }
}

// ---------------------------------------------------------------------------
// 6. Upcoming bills section
// ---------------------------------------------------------------------------

class _UpcomingBillsSection extends ConsumerWidget {
  const _UpcomingBillsSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ghost = ref.watch(ghostModeProvider);
    final recurringAsync = ref.watch(recurringListProvider);

    final rules = recurringAsync.valueOrNull ?? <RecurringRule>[];
    // Sort by nextRun ascending, take soonest 4.
    final sorted = [...rules]
      ..sort((a, b) => a.nextRun.compareTo(b.nextRun));
    final slice = sorted.take(4).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(
          title: 'Upcoming Bills',
          actionLabel: 'See all',
          onAction: () => context.go(Routes.recurring),
        ),
        const SizedBox(height: AppSpacing.sm),
        GlassCard(
          padding: EdgeInsets.zero,
          child: slice.isEmpty
              ? const Padding(
                  padding: EdgeInsets.all(AppSpacing.lg),
                  child: Center(
                    child: Text(
                      'No upcoming bills',
                      style: TextStyle(color: Colors.grey),
                    ),
                  ),
                )
              : Column(
                  children: [
                    for (var i = 0; i < slice.length; i++) ...[
                      _BillRow(rule: slice[i], ghost: ghost),
                      if (i < slice.length - 1)
                        const Divider(height: 1, indent: 60, endIndent: 16),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

class _BillRow extends StatelessWidget {
  const _BillRow({required this.rule, required this.ghost});
  final RecurringRule rule;
  final bool ghost;

  static String _formatDate(DateTime d) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${d.day} ${months[d.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    final isIncome = rule.type == TxnType.income;
    final color = isIncome ? AppColors.income : AppColors.expense;
    final name = rule.merchant ?? (isIncome ? 'Income' : 'Bill');
    final dueStr = _formatDate(rule.nextRun);

    // Days until due.
    final daysUntil = rule.nextRun.difference(DateTime.now()).inDays;
    final dueLabel = daysUntil == 0
        ? 'Today'
        : daysUntil == 1
            ? 'Tomorrow'
            : 'Due $dueStr';

    return Semantics(
      label: ghost
          ? '$name due $dueStr, amount hidden'
          : '$name due $dueStr, ${Money.toWords(rule.amount)}',
      child: ExcludeSemantics(
        child: Padding(
          padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md, vertical: 10),
          child: Row(
            children: [
              // Icon badge.
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.10),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  isIncome ? Icons.payments_outlined : Icons.receipt_long_outlined,
                  color: color,
                  size: 18,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              // Name + due date.
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.copyWith(fontWeight: FontWeight.w600),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      dueLabel,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: daysUntil <= 2
                                ? AppColors.budgetWarn
                                : Theme.of(context)
                                    .colorScheme
                                    .onSurfaceVariant,
                          ),
                    ),
                  ],
                ),
              ),
              // Amount.
              Text(
                ghost ? '••••••' : Money.format(rule.amount),
                style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Shared section header helper
// ---------------------------------------------------------------------------

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    required this.actionLabel,
    required this.onAction,
  });

  final String title;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
        // 48dp minimum touch target.
        SizedBox(
          height: AppSpacing.minTouchTarget,
          child: TextButton(
            onPressed: onAction,
            style: TextButton.styleFrom(
              padding:
                  const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
              minimumSize:
                  const Size(0, AppSpacing.minTouchTarget),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(
              actionLabel,
              style: const TextStyle(
                  color: AppColors.accent, fontWeight: FontWeight.w600),
            ),
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Financial health score
// ---------------------------------------------------------------------------

class _FinancialHealthCard extends ConsumerWidget {
  const _FinancialHealthCard();

  static Color _band(double frac) => frac >= 0.7
      ? AppColors.income
      : frac >= 0.4
          ? AppColors.budgetWarn
          : AppColors.expense;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final h = ref.watch(financialHealthProvider);
    if (h == null) return const SizedBox.shrink();
    final text = Theme.of(context).textTheme;
    final muted = text.bodySmall?.color?.withValues(alpha: 0.65);
    final score = h.score;

    return GlassCard(
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.card),
        onTap: () => context.go(Routes.score),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('Financial Health',
                      style: text.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700)),
                ),
                Icon(Icons.chevron_right_rounded,
                    size: 18, color: Theme.of(context).colorScheme.outline),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Smaller than the Score screen's: net worth is this screen's
                // hero, and two competing hero figures read as neither.
                GaugeChart(
                  value: score?.toDouble(),
                  size: 120,
                  sublabel: h.grade,
                  untrackedLabel: 'Not yet scored',
                ),
                const SizedBox(width: AppSpacing.lg),
                Expanded(
                  child: Column(
                    children: [
                      for (final c in h.categories)
                        Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                          child: _CategoryBar(category: c, muted: muted),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            if (h.isPartial) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                'Based on ${h.trackedCategoryCount} of '
                '${h.categories.length} areas.',
                style: text.labelSmall?.copyWith(color: muted),
              ),
            ],
            const SizedBox(height: AppSpacing.sm),
            Text(h.summary,
                style: text.bodySmall
                    ?.copyWith(color: muted, fontStyle: FontStyle.italic)),
          ],
        ),
      ),
    );
  }
}

/// One category row: a filled bar with points, or a grey bar labelled
/// "Not yet tracked" and carrying no number at all.
///
/// The absence of a number is the point. An untracked category rendered as
/// "0/25" tells the user they scored nothing, when what actually happened is
/// that the app has nothing to score.
class _CategoryBar extends StatelessWidget {
  const _CategoryBar({required this.category, required this.muted});

  final HealthCategory category;
  final Color? muted;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final track = (muted ?? Colors.grey).withValues(alpha: 0.15);
    final fraction = category.fraction;
    final tracked = fraction != null;

    return Semantics(
      label: tracked
          ? '${category.label} '
              '${category.score!.round()} of ${category.weight.toInt()}'
          : '${category.label} not yet tracked',
      child: ExcludeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(category.label, style: text.labelMedium)),
                Text(
                  tracked
                      ? '${category.score!.round()}/${category.weight.toInt()}'
                      : 'Not yet tracked',
                  style: text.labelSmall?.copyWith(color: muted),
                ),
              ],
            ),
            const SizedBox(height: 4),
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadii.pill),
              child: LinearProgressIndicator(
                value: fraction ?? 0,
                minHeight: 5,
                valueColor: AlwaysStoppedAnimation(
                  tracked
                      ? _FinancialHealthCard._band(fraction)
                      : Colors.transparent,
                ),
                backgroundColor: track,
              ),
            ),
            const SizedBox(height: 2),
            Text(category.detail,
                style: text.labelSmall?.copyWith(color: muted)),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Smart insights (local, rule-based)
// ---------------------------------------------------------------------------

/// The Dashboard's single narrative sentence.
///
/// One card, one sentence. The plan is explicit about this, and the reason is
/// that a list of five observations is read as none: the value of an honest
/// insight comes from it being the only thing in the box.
class _InsightsCard extends ConsumerWidget {
  const _InsightsCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final narratives = ref.watch(narrativeProvider);
    // Nothing to say means no card. An "everything looks steady" placeholder is
    // filler, and filler teaches people this box never says anything.
    if (narratives.isEmpty) return const SizedBox.shrink();

    final ghost = ref.watch(ghostModeProvider);
    final narrative = narratives.first;
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;

    final tint = switch (narrative.tone) {
      NarrativeTone.positive => AppColors.income,
      NarrativeTone.caution => AppColors.budgetWarn,
      NarrativeTone.neutral => AppColors.accent,
    };

    return GlassCard(
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.card),
        onTap: () => context.go(Routes.score),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.auto_awesome, size: 18, color: tint),
                const SizedBox(width: AppSpacing.xs),
                Expanded(
                  child: Text('Insight',
                      style: text.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700)),
                ),
                Icon(Icons.chevron_right_rounded,
                    size: 18, color: scheme.outline),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              // Ghost mode masks the whole sentence rather than the figures
              // inside it: "You saved ••••• of ••••" still leaks the shape of
              // someone's month to a shoulder-surfer.
              ghost ? 'Hidden in ghost mode' : narrative.text,
              style: text.bodyMedium,
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              kNarrativeDisclaimer,
              style: text.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}

/// Income against spending, month by month.
///
/// The dashboard already carried a savings-rate tile, which is the same
/// information reduced to one number for one window — and one number cannot
/// answer the question people actually bring to a dashboard, which is not "what
/// did I spend" but "is that more than usual". Six bars answer it without being
/// read.
class _CashFlowCard extends ConsumerWidget {
  const _CashFlowCard();

  static const _months = 6;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(transactionListProvider);
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    // Nothing at all while loading, rather than an empty chart: six flat bars
    // are a claim about six months, and during load there is no such claim to
    // make.
    if (state is! TransactionData) return const SizedBox.shrink();
    final txns = state.transactions;

    final flows = MonthlyCashFlow.lastMonths(txns, months: _months);
    final withYear = MonthlyCashFlow.spansYears(flows);
    final hasAny = flows.any((f) => f.income > Decimal.zero || f.expense > Decimal.zero);

    final saved = flows.fold(Decimal.zero, (s, f) => s + f.net);
    final months = flows.where((f) => f.income > Decimal.zero).length;

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Cash flow',
                    style:
                        text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
              ),
              _LegendDot(color: AppColors.income, label: 'In'),
              const SizedBox(width: AppSpacing.sm),
              _LegendDot(color: AppColors.expense, label: 'Out'),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            hasAny
                ? months == 0
                    ? 'The last $_months months.'
                    : 'Kept ${Money.format(saved)} over the last $_months months.'
                : 'Record a few transactions and your months will appear here.',
            style: text.bodySmall?.copyWith(color: muted),
          ),
          const SizedBox(height: AppSpacing.sm),
          BarChart(
            groups: [
              for (final f in flows)
                BarGroup(
                  label: f.label(withYear: withYear),
                  bars: [
                    Bar(
                        label: 'In',
                        value: f.income.toDouble(),
                        color: AppColors.income),
                    Bar(
                        label: 'Out',
                        value: f.expense.toDouble(),
                        color: AppColors.expense),
                  ],
                ),
            ],
            height: 150,
            formatValue: (v) =>
                Money.format(Decimal.parse(v.toStringAsFixed(2))),
            formatAxis: Money.compact,
            semanticLabel: 'Monthly income and spending for the last '
                '$_months months',
          ),
        ],
      ),
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant)),
      ],
    );
  }
}

/// This month's spending as a donut.
///
/// Was a list of categories with a bar each — which is a table wearing a chart
/// costume. A donut answers "what is the shape of my spending" in one look,
/// which a ranked list cannot: a list tells you the order, and the order was
/// never the question.
class _TopSpendCard extends ConsumerWidget {
  const _TopSpendCard();

  /// Beyond six slices a donut becomes a colour wheel nobody can map back to a
  /// legend, so the tail is folded into one honest "Other".
  static const _maxSlices = 6;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(transactionListProvider);
    final categories = ref.watch(categoryListProvider).valueOrNull ?? const [];

    if (state is! TransactionData) return const SizedBox.shrink();

    final now = DateTime.now();
    final names = {for (final c in categories) c.id: c.name};
    final byCategory = <String, Decimal>{};
    for (final t in state.transactions) {
      if (t.type != TxnType.expense) continue;
      if (t.date.year != now.year || t.date.month != now.month) continue;
      byCategory[t.categoryId] =
          (byCategory[t.categoryId] ?? Decimal.zero) + t.amount;
    }

    final rows = byCategory.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final total = rows.fold(Decimal.zero, (s, e) => s + e.value);

    if (rows.isEmpty) {
      return _DashCard(
        title: 'Where it went',
        subtitle: 'This month.',
        onTap: () => context.go(Routes.reports),
        child: SizedBox(
          height: 120,
          child: Center(
            child: Text('Nothing spent yet this month.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ),
        ),
      );
    }

    // Every category, largest first. DonutChart folds the tail into "Other"
    // and owns expanding it again, so folding here would only turn that row
    // into a dead end.
    final segments = <DonutSegment>[
      for (var i = 0; i < rows.length; i++)
        DonutSegment(names[rows[i].key] ?? 'Uncategorised',
            rows[i].value.toDouble(), _sliceColors[i % _sliceColors.length]),
    ];

    return _DashCard(
      title: 'Where it went',
      subtitle: 'This month · ${Money.format(total)}',
      onTap: () => context.go(Routes.reports),
      child: DonutChart(
        segments: segments,
        size: 140,
        strokeWidth: 20,
        maxSlices: _maxSlices,
        otherLabel: 'Other',
        centerText: Money.compact(total.toDouble()),
        centerSub: 'spent',
        formatValue: (v) => Money.format(Decimal.parse(v.toStringAsFixed(2))),
      ),
    );
  }
}

/// Categorical slice colours.
///
/// Not the asset-group palette: that one is checked for separation in ITS
/// adjacency order, and borrowing it here would put those guarantees on a
/// different set of neighbours where they have not been verified.
/// Category slices draw from the ONE shared series.
///
/// This used to be a private purple-led list, and `portfolio_analytics.dart`
/// had a second, different one — so the same app showed three unrelated chart
/// palettes and none of them matched the web client. `KhazanaColors.series` is
/// the validated set: emerald leads, gold follows, worst adjacent pair ΔE 8.1
/// under protanopia. Its ORDER is the colourblind-safety mechanism.
const _sliceColors = KhazanaColors.series;

/// Budgets as a row of dials.
///
/// A dial reads as "how full is this" without being measured, which is the only
/// question a budget raises. The list of remaining amounts it replaces made the
/// reader compare numbers against limits in their head, one row at a time.
class _BudgetPulseCard extends ConsumerWidget {
  const _BudgetPulseCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final progress = [...ref.watch(budgetProgressProvider)]
      ..sort((a, b) => b.fraction.compareTo(a.fraction));
    // Budget.categoryId is a uuid; the Budget screen resolves it the same way.
    // Printing the raw id would put a hex string where a category name belongs.
    final names = {
      for (final c in ref.watch(categoryListProvider).valueOrNull ?? const [])
        c.id: c.name,
    };
    final text = Theme.of(context).textTheme;
    final over = progress.where((p) => p.remaining < Decimal.zero).length;

    return _DashCard(
      title: 'Budgets',
      subtitle: progress.isEmpty
          ? 'Set a budget and its dial shows here.'
          : over > 0
              ? '$over over the limit.'
              : 'All within limit.',
      onTap: () => context.go(Routes.budget),
      child: progress.isEmpty
          ? const SizedBox(height: 40)
          : Wrap(
              spacing: AppSpacing.md,
              runSpacing: AppSpacing.sm,
              children: [
                for (final p in progress.take(4))
                  SizedBox(
                    width: 92,
                    child: Column(
                      children: [
                        GaugeChart(
                          // Percentage used, so every dial is on the same
                          // scale regardless of the limit behind it — four
                          // dials with four different maxima cannot be
                          // compared at a glance, which is the whole point.
                          value: (p.fraction * 100).clamp(0, 100),
                          bands: kBudgetBands,
                          size: 84,
                          strokeWidth: 9,
                          label: '${(p.fraction * 100).round()}%',
                        ),
                        Text(
                          names[p.budget.categoryId] ?? 'Uncategorised',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: text.bodySmall,
                        ),
                        Text(
                          p.remaining < Decimal.zero
                              ? '${Money.compact((-p.remaining).toDouble())} over'
                              : '${Money.compact(p.remaining.toDouble())} left',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: text.labelSmall?.copyWith(
                            color: p.remaining < Decimal.zero
                                ? AppColors.expense
                                : Theme.of(context)
                                    .colorScheme
                                    .onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }
}

/// Two balanced columns on a wide window, one on a narrow one.
///
/// The dashboard was a single-column `ListView`, so on a 1400px window every
/// card spanned the full width and you scrolled past them one at a time. That
/// is a scroll of banners, not a dashboard — a dashboard's whole claim is that
/// several things are true at once and you can see them at once.
///
/// Cards alternate left/right rather than being packed by measured height.
/// Height-balanced masonry needs a layout pass before it can place anything,
/// which means the order changes as data loads — cards moving between columns
/// while you read them is worse than a slightly uneven bottom edge.
class _Masonry extends StatelessWidget {
  const _Masonry({required this.children});

  final List<Widget> children;

  /// Below this the two columns would each be too narrow for a donut plus its
  /// legend, so the grid collapses to one.
  static const double _breakpoint = 860;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        if (c.maxWidth < _breakpoint) {
          return Column(
            children: [
              for (final w in children)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: w,
                ),
            ],
          );
        }
        final left = <Widget>[];
        final right = <Widget>[];
        for (var i = 0; i < children.length; i++) {
          (i.isEven ? left : right).add(Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
            child: children[i],
          ));
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: Column(children: left)),
            const SizedBox(width: AppSpacing.md),
            Expanded(child: Column(children: right)),
          ],
        );
      },
    );
  }
}

/// Goals as rings.
///
/// A full ring, unlike the 240° health gauge, because a goal genuinely is a
/// proportion of a whole — the amount saved out of the amount needed — and that
/// is exactly what a closed circle encodes.
class _GoalsCard extends ConsumerWidget {
  const _GoalsCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final goals = ref.watch(goalListProvider).valueOrNull ?? const [];
    final text = Theme.of(context).textTheme;

    double pct(Goal g) => g.targetAmount <= Decimal.zero
        ? 0
        : (g.currentAmount / g.targetAmount).toDouble().clamp(0.0, 1.0);

    final open = goals.where((g) => !g.isAchieved).toList()
      ..sort((a, b) => pct(b).compareTo(pct(a)));

    return _DashCard(
      title: 'Goals',
      subtitle: open.isEmpty
          ? 'Set a goal and its ring shows here.'
          : '${open.length} in progress.',
      onTap: () => context.go(Routes.goals),
      child: open.isEmpty
          ? const SizedBox(height: 40)
          : Wrap(
              spacing: AppSpacing.md,
              runSpacing: AppSpacing.sm,
              children: [
                for (final g in open.take(4))
                  SizedBox(
                    width: 92,
                    child: Column(
                      children: [
                        DonutChart(
                          segments: [
                            DonutSegment('Saved', pct(g), AppColors.income),
                            DonutSegment(
                                'To go',
                                1 - pct(g),
                                Theme.of(context)
                                    .colorScheme
                                    .surfaceContainerHighest),
                          ],
                          size: 84,
                          strokeWidth: 9,
                          showLegend: false,
                          centerText: '${(pct(g) * 100).round()}%',
                        ),
                        Text(
                          g.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: text.bodySmall,
                        ),
                        Text(
                          Money.compact(g.currentAmount.toDouble()),
                          style: text.labelSmall?.copyWith(
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }
}

/// What the portfolio is made of, without leaving the dashboard.
class _AllocationMiniCard extends ConsumerWidget {
  const _AllocationMiniCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final totals = ref.watch(investmentTotalsProvider).valueOrNull;
    if (totals == null || totals.marketValue <= Decimal.zero) {
      return const SizedBox.shrink();
    }

    // Declaration order, never value-sorted. The palette is checked for
    // colourblind separation with the groups adjacent in THIS order;
    // re-sorting by size can put two near-identical hues side by side.
    final segments = <DonutSegment>[
      for (final g in AssetGroup.values)
        if ((totals.valueByGroup[g] ?? Decimal.zero) > Decimal.zero)
          DonutSegment(
              g.label, totals.valueByGroup[g]!.toDouble(), groupColor(g)),
    ];

    return _DashCard(
      title: 'Allocation',
      subtitle: '${totals.positionCount} holding'
          '${totals.positionCount == 1 ? '' : 's'}',
      onTap: () => context.go(Routes.investments),
      child: DonutChart(
        segments: segments,
        size: 140,
        strokeWidth: 20,
        centerText: Money.compact(totals.marketValue.toDouble()),
        centerSub: 'portfolio',
        formatValue: (v) => Money.format(Decimal.parse(v.toStringAsFixed(2))),
      ),
    );
  }
}

/// A card with a heading, a one-line explanation and a tap target.
///
/// Every dashboard widget is a summary of a screen that holds the full version,
/// so each one is a link. Repeating the chrome by hand was how the existing
/// cards drifted into three different heading weights.
class _DashCard extends StatelessWidget {
  const _DashCard({
    required this.title,
    required this.child,
    this.subtitle,
    this.onTap,
  });

  final String title;
  final Widget child;
  final String? subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    // Delegates to the design-system card so the header/content hairline is the
    // same one the web client draws. This card used to separate its header from
    // its body with nothing but a SizedBox, so the two ran together and each
    // section read as one undifferentiated block. The web card has a full-bleed
    // 1px rule there, and that rule is what makes a dense dashboard scannable.
    return KSectionCard(
      title: title,
      subtitle: subtitle,
      onTap: onTap,
      child: child,
    );
  }
}

