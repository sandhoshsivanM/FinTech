import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/utils/money_format.dart';
import '../../capture/providers/capture_providers.dart';
import '../../reports/providers/dashboard_providers.dart';
import '../home_palette.dart';
import '../home_providers.dart';

/// Today at a glance: money in, money out and what is left, filled in by
/// auto-captured bank SMS as the day goes. A link to the review inbox appears
/// only when captures are waiting.
class TodayFlowCard extends ConsumerWidget {
  const TodayFlowCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final (:day, :regularIncome) = ref.watch(todayFlowProvider);
    final toReview = ref.watch(pendingCaptureListProvider).valueOrNull?.length ?? 0;
    final ghost = ref.watch(ghostModeProvider);
    final p = HomePalette.of(context);
    final text = Theme.of(context).textTheme;
    String money(Decimal v) => ghost ? '••••' : Money.format(v);
    final net = day.net;
    final quiet = day.income == Decimal.zero && day.expense == Decimal.zero;

    Widget figure(String label, String value, Color color, {String? note}) =>
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: TextStyle(fontSize: 12, color: p.muted)),
              const SizedBox(height: 4),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  value,
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w500,
                    color: color,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ),
              if (note != null) ...[
                const SizedBox(height: 2),
                Text(
                  note,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11, color: p.muted),
                ),
              ],
            ],
          ),
        );

    return HomeGroup(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Today',
                  style: text.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: p.ink,
                  ),
                ),
              ),
              if (toReview > 0)
                TextButton(
                  onPressed: () => context.go(Routes.captureInbox),
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('$toReview to review'),
                      const Icon(Icons.chevron_right_rounded, size: 18),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          if (quiet)
            Text(
              'Nothing recorded yet today.',
              style: TextStyle(fontSize: 13, color: p.muted),
            )
          else
            Semantics(
              container: true,
              label: ghost
                  ? 'Today, amounts hidden'
                  : 'Today: ${Money.toWords(day.income)} in, '
                      '${Money.toWords(day.expense)} out',
              child: ExcludeSemantics(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    figure(
                      'In',
                      money(day.income),
                      p.green,
                      note: regularIncome > Decimal.zero
                          ? 'incl. ${money(regularIncome)} regular'
                          : null,
                    ),
                    figure('Out', money(day.expense), p.rose),
                    figure(
                      'Net',
                      '${net < Decimal.zero ? '−' : '+'}${money(net.abs())}',
                      p.ink,
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
