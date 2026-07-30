import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme/app_tokens.dart';
import '../features/settings/providers/onboarding_providers.dart';

/// One area of the app, explained once.
class _Area {
  const _Area(this.icon, this.title, this.body);
  final IconData icon;
  final String title;
  final String body;
}

const _areas = <_Area>[
  _Area(Icons.dashboard_outlined, 'Overview',
      'Your home screen: net worth (what you own minus what you owe), trends, a financial-health score and smart insights. Tap the eye to hide amounts.'),
  _Area(Icons.receipt_long_outlined, 'Cash Flow',
      'Every transaction in one list — search, filter by income/expense, edit or delete, and export to CSV. Use the + button or natural-language quick-add. Attach a receipt photo to any entry.'),
  _Area(Icons.calendar_month_outlined, 'Calendar',
      'See your money day by day. Tap any date for its income, spending and receipts; per-category budgets show green → amber → red as you approach the limit.'),
  _Area(Icons.auto_awesome_motion_outlined, 'Auto-capture',
      'On Android, incoming bank SMS and notifications are read on-device and turned into ready-to-review transactions — you just confirm the category. Nothing ever leaves your phone.'),
  _Area(Icons.trending_up, 'Investments',
      'Your holdings with allocation, profit/loss, XIRR returns and an unrealised-tax estimate. Import holdings from a broker file.'),
  _Area(Icons.credit_card_outlined, 'Liabilities',
      'Track loans & credit cards — balances, APR, EMIs, card utilisation, and a debt-payoff planner (avalanche / snowball).'),
  _Area(Icons.shield_outlined, 'Insurance',
      'Record your policies and see a coverage-gap analysis — whether your life and health cover are enough.'),
  _Area(Icons.pie_chart_outline, 'Budget',
      'Set monthly spending limits per category with green / amber / red progress and over-budget alerts.'),
  _Area(Icons.flag_outlined, 'Goals',
      'Savings targets (emergency fund, house, trip…) with progress and the monthly amount needed to get there.'),
  _Area(Icons.bar_chart, 'Reports',
      'Charts over time — net-worth trend, income vs expense, and where your money goes by category.'),
  _Area(Icons.repeat, 'Recurring',
      'Set up bills and income that repeat — they post automatically and show as upcoming on your dashboard.'),
  _Area(Icons.account_balance_wallet_outlined, 'Vaults & profiles',
      'Keep separate, encrypted vaults for yourself, your spouse or a business. Switch or add them from Settings.'),
  _Area(Icons.lock_outline, 'Private by design',
      'Everything is encrypted and stays on this device — no servers, ever. Export an encrypted backup any time from Settings.'),
];

/// Shows the full-screen guided tour, then marks it (and onboarding) seen.
Future<void> showTour(BuildContext context, WidgetRef ref) async {
  await showGeneralDialog<void>(
    context: context,
    barrierDismissible: false,
    barrierLabel: 'Tour',
    pageBuilder: (_, _, _) => const _TourScreen(),
  );
  await ref.read(onboardingActionsProvider).markTourSeen();
  await ref.read(onboardingActionsProvider).markSeen();
}

/// Drop into the dashboard; shows the tour once on first run.
class TourLauncher extends ConsumerStatefulWidget {
  const TourLauncher({super.key});
  @override
  ConsumerState<TourLauncher> createState() => _TourLauncherState();
}

class _TourLauncherState extends ConsumerState<TourLauncher> {
  bool _shown = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (_shown || !mounted) return;
      final seen = await ref.read(tourSeenProvider.future);
      if (seen || _shown || !mounted) return;
      _shown = true;
      await showTour(context, ref);
    });
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

class _TourScreen extends StatefulWidget {
  const _TourScreen();
  @override
  State<_TourScreen> createState() => _TourScreenState();
}

class _TourScreenState extends State<_TourScreen> {
  final _controller = PageController();
  int _i = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _close() => Navigator.of(context).pop();

  @override
  Widget build(BuildContext context) {
    final last = _i == _areas.length - 1;
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface,
      child: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.sm),
                child: TextButton(
                    onPressed: _close, child: const Text('Skip')),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _areas.length,
                onPageChanged: (i) => setState(() => _i = i),
                itemBuilder: (context, i) {
                  final a = _areas[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.xl),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 96,
                          height: 96,
                          decoration: BoxDecoration(
                            color: AppColors.accent.withValues(alpha: 0.12),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(a.icon,
                              size: 44, color: AppColors.accent),
                        ),
                        const SizedBox(height: AppSpacing.xl),
                        Text(a.title,
                            textAlign: TextAlign.center,
                            style: Theme.of(context)
                                .textTheme
                                .headlineSmall
                                ?.copyWith(fontWeight: FontWeight.w800)),
                        const SizedBox(height: AppSpacing.md),
                        Text(a.body,
                            textAlign: TextAlign.center,
                            style: Theme.of(context)
                                .textTheme
                                .bodyLarge
                                ?.copyWith(
                                    color: scheme.onSurfaceVariant,
                                    height: 1.5)),
                      ],
                    ),
                  );
                },
              ),
            ),
            // Page dots.
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var d = 0; d < _areas.length; d++)
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: d == _i ? 18 : 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: d == _i
                          ? AppColors.accent
                          : scheme.onSurfaceVariant.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Row(
                children: [
                  SizedBox(
                    width: 72,
                    child: _i > 0
                        ? TextButton(
                            onPressed: () => _controller.previousPage(
                                duration: const Duration(milliseconds: 250),
                                curve: Curves.easeOut),
                            child: const Text('Back'))
                        : null,
                  ),
                  Expanded(
                    child: Text('${_i + 1} / ${_areas.length}',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: scheme.onSurfaceVariant)),
                  ),
                  SizedBox(
                    width: 110,
                    child: FilledButton(
                      onPressed: () {
                        if (last) {
                          _close();
                        } else {
                          _controller.nextPage(
                              duration: const Duration(milliseconds: 250),
                              curve: Curves.easeOut);
                        }
                      },
                      child: Text(last ? 'Get started' : 'Next'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
