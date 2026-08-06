import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
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
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md, vertical: AppSpacing.sm),
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

        // 4b. Cash flow, month by month. Above the net-worth trend because it
        //     is the shorter horizon and the one a person can act on this week.
        const _CashFlowCard(),
        const SizedBox(height: AppSpacing.md),

        // 5. Window selector + trend chart.
        _WindowSelector(
          selected: window,
          onChanged: (w) =>
              ref.read(selectedWindowProvider.notifier).state = w,
        ),
        const SizedBox(height: AppSpacing.sm),
        _TrendChart(series: ref.watch(dashboardTrendProvider)),
        const SizedBox(height: AppSpacing.md),

        // 6. Quick links to everything that is not a tab.
        const _QuickLinks(),
        const SizedBox(height: AppSpacing.md),

        // 5. Recent transactions.
        const _RecentTransactionsSection(),
        const SizedBox(height: AppSpacing.md),

        // 6. Upcoming bills.
        const _UpcomingBillsSection(),
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
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md, vertical: AppSpacing.sm),
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
              const Text('👋', style: TextStyle(fontSize: 20)),
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
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: AppColors.accentGradient,
          ),
          boxShadow: [
            BoxShadow(
              color: AppColors.accentDeep.withValues(alpha: 0.40),
              blurRadius: 32,
              offset: const Offset(0, 16),
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
                      color: Colors.white70, size: 16),
                  const SizedBox(width: AppSpacing.xs),
                  Text(
                    'NET WORTH',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: Colors.white70,
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
        Row(
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
        const SizedBox(height: AppSpacing.sm),
        Row(
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
