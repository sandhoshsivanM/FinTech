import '../../../core/help/info_hint.dart';
import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/money_format.dart';
import 'package:khazana_domain/entities/transaction.dart';
import 'package:khazana_domain/services/daily_flow.dart';
import '../../reports/providers/dashboard_providers.dart';
import '../../transactions/providers/category_providers.dart';
import '../../transactions/providers/transaction_providers.dart';
import '../home_palette.dart';
import '../home_providers.dart';

typedef _Insight = ({String figure, String title, String detail});

/// One finding at a time, large: the week against last week, the month's
/// budget, the biggest category. Every figure is computed from the vault; an
/// insight with nothing to say is left out rather than padded. The twin of
/// `webapp/src/components/home/InsightCard.tsx`.
class InsightCard extends ConsumerStatefulWidget {
  const InsightCard({super.key});

  @override
  ConsumerState<InsightCard> createState() => _InsightCardState();
}

class _InsightCardState extends ConsumerState<InsightCard> {
  int _i = 0;

  List<_Insight> _insights() {
    final ghost = ref.watch(ghostModeProvider);
    String money(Decimal v) => ghost ? '••••' : Money.format(v);
    final out = <_Insight>[];

    final f = ref.watch(fortnightFlowProvider);
    Decimal spent(Iterable<DayFlow> ds) =>
        ds.fold(Decimal.zero, (s, d) => s + d.expense);
    if (f.length == 14) {
      final now = spent(f.sublist(7)), before = spent(f.sublist(0, 7));
      final c = describeChange(now, before);
      if (c != null) {
        out.add((
          figure: c.text,
          title: c.text.endsWith('×')
              ? 'This week’s spending, compared with last week.'
              : c.up
              ? 'More spent than last week.'
              : 'Less spent than last week.',
          detail:
              '${money(now)} in the last 7 days, against '
              '${money(before)} the week before.',
        ));
      }
    }

    final b = ref.watch(budgetSummaryProvider);
    if (b != null && b.limit > Decimal.zero) {
      final today = DateTime.now();
      final end = DateTime(today.year, today.month + 1, 0);
      final left =
          end.difference(DateTime(today.year, today.month, today.day)).inDays +
          1;
      final remaining = b.limit - b.spent;
      out.add((
        figure: '${(b.used * 100).round()}%',
        title: 'Of this month’s budget used.',
        detail:
            '${money(remaining < Decimal.zero ? Decimal.zero : remaining)} '
            'left to spend over the next $left day${left == 1 ? '' : 's'}.',
      ));
    }

    final state = ref.watch(transactionListProvider);
    final txns = state is TransactionData ? state.transactions : const <Txn>[];
    final now = DateTime.now();
    final byCat = <String, Decimal>{};
    var total = Decimal.zero;
    for (final t in txns) {
      if (t.type != TxnType.expense ||
          t.date.year != now.year ||
          t.date.month != now.month) {
        continue;
      }
      byCat[t.categoryId] = (byCat[t.categoryId] ?? Decimal.zero) + t.amount;
      total += t.amount;
    }
    if (byCat.isNotEmpty && total > Decimal.zero) {
      final top = byCat.entries.reduce((a, e) => e.value > a.value ? e : a);
      final cats = ref.watch(categoryListProvider).valueOrNull ?? const [];
      final name =
          cats.where((c) => c.id == top.key).firstOrNull?.name ??
          'One category';
      out.add((
        figure: '${(top.value.toDouble() / total.toDouble() * 100).round()}%',
        title: 'Of this month’s spending went on $name.',
        detail:
            '${money(top.value)} of ${money(total)} spent so far this month.',
      ));
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final insights = _insights();
    if (insights.isEmpty) return const SizedBox.shrink();
    final cur = insights[_i.clamp(0, insights.length - 1)];
    final p = HomePalette.of(context);
    const white = Colors.white;

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: p.insight,
          stops: const [0, 0.5, 1],
        ),
      ),
      child: Stack(
        children: [
          // A soft warm light, top right, and thin orbit lines: depth
          // without adding another colour.
          Positioned(
            right: -60,
            top: -80,
            child: Container(
              width: 240,
              height: 240,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [Color(0x66FFD2A8), Color(0x00FFD2A8)],
                ),
              ),
            ),
          ),
          const Positioned.fill(child: CustomPaint(painter: _Orbits())),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: white.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.lightbulb_outline, size: 14, color: white),
                          SizedBox(width: 5),
                          Text(
                            'Insights',
                            style: TextStyle(color: white, fontSize: 11.5),
                          ),
                        ],
                      ),
                    ),
                    const InfoHint('dashboard.quickInsights', color: white),
                  ],
                ),
                const SizedBox(height: 18),
                Semantics(
                  liveRegion: true,
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 350),
                    transitionBuilder: (child, a) => FadeTransition(
                      opacity: a,
                      child: SlideTransition(
                        position: Tween(
                          begin: const Offset(0, .08),
                          end: Offset.zero,
                        ).animate(a),
                        child: child,
                      ),
                    ),
                    child: Column(
                      key: ValueKey(_i),
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          cur.figure,
                          style: const TextStyle(
                            color: white,
                            fontSize: 62,
                            fontWeight: FontWeight.w300,
                            height: 1,
                            letterSpacing: -1.5,
                          ),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          cur.title,
                          style: const TextStyle(
                            color: white,
                            fontSize: 17,
                            fontWeight: FontWeight.w600,
                            height: 1.3,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          cur.detail,
                          style: TextStyle(
                            color: white.withValues(alpha: 0.8),
                            fontSize: 13,
                            height: 1.45,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                if (insights.length > 1) ...[
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      for (var k = 0; k < insights.length; k++)
                        Expanded(
                          child: Semantics(
                            button: true,
                            selected: k == _i,
                            label: 'Insight ${k + 1} of ${insights.length}',
                            child: GestureDetector(
                              onTap: () => setState(() => _i = k),
                              behavior: HitTestBehavior.opaque,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 3,
                                  vertical: 8,
                                ),
                                child: AnimatedContainer(
                                  duration: const Duration(milliseconds: 250),
                                  height: 3,
                                  decoration: BoxDecoration(
                                    color: k == _i
                                        ? white
                                        : white.withValues(alpha: 0.3),
                                    borderRadius: BorderRadius.circular(2),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Orbits extends CustomPainter {
  const _Orbits();

  @override
  void paint(Canvas canvas, Size size) {
    final line = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.8;
    canvas
      ..drawCircle(
        Offset(size.width * 0.72, size.height * 0.95),
        size.width * 0.55,
        line..color = const Color(0x47FFFFFF),
      )
      ..drawCircle(
        Offset(size.width * 1.02, size.height * 0.08),
        size.width * 0.38,
        line..color = const Color(0x33FFFFFF),
      );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
