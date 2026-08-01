import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/investment_totals.dart';
import '../../../domain/entities/recurring_rule.dart';
import '../../../domain/entities/transaction.dart';
import '../../../domain/services/net_worth_calculator.dart';
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
      return const Center(child: CircularProgressIndicator());
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

        // 3b. Quick links to the rest of the app.
        const _QuickLinks(),
        const SizedBox(height: AppSpacing.md),

        // 4. Window selector + trend chart.
        _WindowSelector(
          selected: window,
          onChanged: (w) =>
              ref.read(selectedWindowProvider.notifier).state = w,
        ),
        const SizedBox(height: AppSpacing.sm),
        _TrendChart(series: ref.watch(dashboardTrendProvider)),
        const SizedBox(height: AppSpacing.md),

        // 4b. Financial health score.
        const _FinancialHealthCard(),
        const SizedBox(height: AppSpacing.md),

        // 4c. Smart insights.
        const _InsightsCard(),
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
    final values = series.map((p) => p.value.toDouble()).toList();
    final allFlat = values.isEmpty ||
        (values.reduce((a, b) => a < b ? a : b) ==
            values.reduce((a, b) => a > b ? a : b));

    if (series.length < 2 || allFlat) {
      return GlassCard(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: SizedBox(
          height: 160,
          width: double.infinity,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.show_chart,
                  size: 36, color: Theme.of(context).colorScheme.outline),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Your net worth trend will appear here',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.xs),
              const Text(
                'Add a few transactions to get started',
                style: TextStyle(fontSize: 12, color: Colors.grey),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    // Downsample to at most ~60 points for a smooth, cheap sparkline.
    final raw = values;
    final step = (raw.length / 60).ceil().clamp(1, raw.length);
    final pts = <double>[
      for (var i = 0; i < raw.length; i += step) raw[i],
    ];
    if (pts.last != raw.last) pts.add(raw.last);

    return Semantics(
      label: 'Net worth trend over the selected period, '
          'ending at ${Money.toWords(series.last.value)}',
      child: ExcludeSemantics(
        child: GlassCard(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: SizedBox(
            height: 150,
            width: double.infinity,
            child: CustomPaint(
              painter: _SparklinePainter(pts, AppColors.accent),
            ),
          ),
        ),
      ),
    );
  }
}

/// Lightweight net-worth sparkline (CustomPainter — no chart lib, no animation
/// ticker, smooth on web). Draws a gradient-filled trend line.
class _SparklinePainter extends CustomPainter {
  _SparklinePainter(this.values, this.color);
  final List<double> values;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2) return;
    final minV = values.reduce((a, b) => a < b ? a : b);
    final maxV = values.reduce((a, b) => a > b ? a : b);
    final range = (maxV - minV).abs() < 1e-9 ? 1.0 : (maxV - minV);
    final dx = size.width / (values.length - 1);

    Offset at(int i) => Offset(
          i * dx,
          size.height - ((values[i] - minV) / range) * (size.height - 8) - 4,
        );

    final line = Path()..moveTo(at(0).dx, at(0).dy);
    for (var i = 1; i < values.length; i++) {
      line.lineTo(at(i).dx, at(i).dy);
    }

    // Gradient fill below the line.
    final fill = Path.from(line)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(
      fill,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [color.withValues(alpha: 0.22), color.withValues(alpha: 0.0)],
        ).createShader(Offset.zero & size),
    );

    canvas.drawPath(
      line,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeJoin = StrokeJoin.round
        ..strokeCap = StrokeCap.round,
    );

    // End dot.
    final last = at(values.length - 1);
    canvas.drawCircle(last, 3.5, Paint()..color = color);
    canvas.drawCircle(
        last, 3.5, Paint()..color = color.withValues(alpha: 0.25)..strokeWidth = 4..style = PaintingStyle.stroke);
  }

  @override
  bool shouldRepaint(_SparklinePainter old) =>
      old.values != values || old.color != color;
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
    final color = _band(h.score / 100);

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Financial Health',
              style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: AppSpacing.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              SizedBox(
                width: 84,
                height: 84,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    SizedBox(
                      width: 84,
                      height: 84,
                      child: CircularProgressIndicator(
                        value: h.score / 100,
                        strokeWidth: 8,
                        valueColor: AlwaysStoppedAnimation(color),
                        backgroundColor: color.withValues(alpha: 0.15),
                      ),
                    ),
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('${h.score}',
                            style: text.titleLarge?.copyWith(
                                fontWeight: FontWeight.w800, color: color)),
                        Text(h.grade,
                            style: text.labelSmall?.copyWith(color: muted)),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.lg),
              Expanded(
                child: Column(
                  children: [
                    for (final p in h.pillars)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                    child: Text(p.label,
                                        style: text.labelMedium)),
                                Text('${p.score.round()}/${p.max.toInt()}',
                                    style:
                                        text.labelSmall?.copyWith(color: muted)),
                              ],
                            ),
                            const SizedBox(height: 4),
                            ClipRRect(
                              borderRadius:
                                  BorderRadius.circular(AppRadii.pill),
                              child: LinearProgressIndicator(
                                value: p.max > 0 ? p.score / p.max : 0,
                                minHeight: 5,
                                valueColor: AlwaysStoppedAnimation(
                                    _band(p.max > 0 ? p.score / p.max : 0)),
                                backgroundColor: (muted ?? Colors.grey)
                                    .withValues(alpha: 0.15),
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(p.detail,
                                style: text.labelSmall?.copyWith(color: muted)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(h.summary,
              style: text.bodySmall
                  ?.copyWith(color: muted, fontStyle: FontStyle.italic)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Smart insights (local, rule-based)
// ---------------------------------------------------------------------------

class _InsightsCard extends ConsumerWidget {
  const _InsightsCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ins = ref.watch(dashboardInsightsProvider);
    if (ins == null) return const SizedBox.shrink();
    final ghost = ref.watch(ghostModeProvider);
    final cats = ref.watch(categoryListProvider).valueOrNull ?? const [];
    final text = Theme.of(context).textTheme;

    String catName(String id) {
      for (final c in cats) {
        if (c.id == id) return c.name;
      }
      return 'Other';
    }

    String m(Decimal d) => ghost ? '••••••' : Money.format(d);

    final tips = <String>[];
    if (ins.safe.remaining > Decimal.zero) {
      final days = ins.safe.daysLeft;
      tips.add(
          'Safe to spend: ${m(ins.safe.perDay)}/day for the next $days day${days == 1 ? '' : 's'} (${m(ins.safe.remaining)} left this month).');
    }
    for (final a in ins.anomalies.take(2)) {
      tips.add(
          '${catName(a.categoryId)} is ${a.ratio.toStringAsFixed(1)}× your usual — ${m(a.current)} vs ${m(a.avg)} avg.');
    }
    if (tips.isEmpty) {
      tips.add('No alerts right now — your spending looks steady.');
    }

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.auto_awesome,
                  size: 18, color: AppColors.accent),
              const SizedBox(width: AppSpacing.xs),
              Text('Insights',
                  style:
                      text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          for (final t in tips)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 26,
                    height: 26,
                    margin: const EdgeInsets.only(top: 1),
                    decoration: BoxDecoration(
                      color: AppColors.accent.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.auto_awesome,
                        size: 14, color: AppColors.accent),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(child: Text(t, style: text.bodySmall)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
