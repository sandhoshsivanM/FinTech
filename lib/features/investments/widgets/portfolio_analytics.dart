import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';

import '../../../design_system/tokens/khazana_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/services/portfolio_analytics.dart';
import '../../../presentation/charts/bar_chart.dart';
import '../../../presentation/charts/diverging_bar_chart.dart';
import '../../../presentation/charts/donut_chart.dart';
import '../../../presentation/charts/gauge_chart.dart';
import '../../../presentation/glass_card.dart';
import '../providers/portfolio_providers.dart';

/// Return on a position as a fraction, or null when there is no cost to
/// measure against.
///
/// A zero cost basis is not a 0% return and is not an infinite one — it is a
/// position whose return is undefined, usually a bonus issue or a fully
/// realised holding. Returning 0 would rank it among the flat performers and
/// hide it.
double? _returnOf(Position p) {
  if (p.costBasis <= Decimal.zero) return null;
  return (p.unrealisedPnl / p.costBasis).toDouble();
}

/// Categorical slice colours for per-holding charts.
///
/// Not the asset-group palette: that set's colourblind separation was verified
/// for ITS adjacency order, and lending it to a different set of neighbours
/// lends none of the guarantee.
/// A ramp, not a rainbow.
///
/// Eight fully saturated hues is what makes a dashboard look generated: the eye
/// reads "many colours" before it reads any value, and none of them mean
/// anything relative to each other. This walks blue to violet with one warm
/// break, so ordering is visible in the colour itself — slice four is further
/// along the ramp than slice two, which is true, where "orange vs teal" says
/// nothing.
/// Draws from the ONE shared series — see `KhazanaColors.series`. The local
/// blue ramp this replaces did not match the dashboard's palette or the web
/// client's, so the same portfolio was three different colours in three places.
const _sliceColors = KhazanaColors.series;

String _pct(double fraction) =>
    '${fraction >= 0 ? '+' : ''}${(fraction * 100).toStringAsFixed(1)}%';

/// A titled analytics card, so the six below cannot drift apart.
class _Card extends StatelessWidget {
  const _Card({required this.title, required this.child, this.subtitle});

  final String title;
  final String? subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          ?subtitle == null
              ? null
              : Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.xs),
                  child: Text(subtitle!,
                      style: text.bodySmall?.copyWith(color: muted)),
                ),
          const SizedBox(height: AppSpacing.sm),
          child,
        ],
      ),
    );
  }
}

/// Gain and loss per holding, on one axis.
class PnlByHoldingCard extends StatelessWidget {
  const PnlByHoldingCard({required this.snap, this.limit = 10, super.key});

  final PortfolioSnapshot snap;
  final int limit;

  @override
  Widget build(BuildContext context) {
    final positions = [...snap.positions]
      ..sort((a, b) => b.unrealisedPnl.compareTo(a.unrealisedPnl));

    // Both ends, not the top N. Taking the ten largest gains would drop every
    // loss the moment a portfolio has more than ten winners — and the losses
    // are the half a person came to look at.
    final head = positions.take(limit ~/ 2).toList();
    final tail = positions.reversed
        .take(limit - head.length)
        .where((p) => !head.contains(p))
        .toList()
        .reversed
        .toList();

    final shown = [...head, ...tail];
    final hidden = positions.length - shown.length;

    return _Card(
      title: 'Gain and loss by holding',
      subtitle: hidden > 0
          ? 'Best and worst — $hidden more not shown.'
          : 'Every holding.',
      child: DivergingBarChart(
        bars: [
          for (final p in shown)
            DivergingBar(
              label: p.instrument.name,
              value: p.unrealisedPnl.toDouble(),
              detail: switch (_returnOf(p)) {
                final r? => _pct(r),
                _ => null,
              },
            ),
        ],
        formatValue: (v) =>
            Money.format(Decimal.parse(v.toStringAsFixed(2))),
        semanticLabel: 'Unrealised gain or loss for each holding',
      ),
    );
  }
}

/// How many holdings are up, and how many are down.
class WinnersLosersCard extends StatelessWidget {
  const WinnersLosersCard({required this.snap, super.key});

  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    var up = 0, down = 0, flat = 0;
    for (final p in snap.positions) {
      if (p.unrealisedPnl > Decimal.zero) {
        up++;
      } else if (p.unrealisedPnl < Decimal.zero) {
        down++;
      } else {
        // Counted separately rather than folded into either side. A holding
        // bought today sits at exactly zero, and calling it a winner or a
        // loser is a claim the data does not make.
        flat++;
      }
    }

    return _Card(
      title: 'Winners and losers',
      subtitle: '${snap.positions.length} holding'
          '${snap.positions.length == 1 ? '' : 's'}',
      child: DonutChart(
        segments: [
          if (up > 0) DonutSegment('In profit', up.toDouble(), AppColors.income),
          if (down > 0)
            DonutSegment('At a loss', down.toDouble(), AppColors.expense),
          if (flat > 0)
            DonutSegment('Flat', flat.toDouble(), scheme.outlineVariant),
        ],
        size: 116,
        strokeWidth: 16,
        centerText: '$up / ${snap.positions.length}',
        centerSub: 'in profit',
        formatValue: (v) => '${v.round()} holdings',
      ),
    );
  }
}

/// How spread out the portfolio is.
///
/// Scored on the two things a holdings snapshot can actually see: how much sits
/// in the single largest position, and how many positions there are. Sector
/// spread is deliberately excluded — most holdings in this app are unclassified
/// until the user sets a sector, so scoring it would mark a well-diversified
/// portfolio as concentrated for a reason that is about missing metadata rather
/// than about the money.
class DiversificationCard extends StatelessWidget {
  const DiversificationCard({required this.snap, super.key});

  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context) {
    final positions = snap.positions;
    if (positions.isEmpty) return const SizedBox.shrink();

    final total = positions.fold(
        Decimal.zero, (s, p) => s + p.marketValue);
    if (total <= Decimal.zero) return const SizedBox.shrink();

    final largest = positions
        .map((p) => (p.marketValue / total).toDouble())
        .reduce((a, b) => a > b ? a : b);

    // Concentration scores 0 at 60%-in-one-holding and 100 at 10%, which is the
    // range over which the risk actually changes. Count scores 0 at one holding
    // and 100 at fifteen; beyond that another ticker adds little.
    final concentration = ((0.60 - largest) / 0.50 * 100).clamp(0.0, 100.0);
    final breadth = ((positions.length - 1) / 14 * 100).clamp(0.0, 100.0);
    final score = (concentration * 0.6 + breadth * 0.4).round();

    final biggest = positions
        .reduce((a, b) => b.marketValue > a.marketValue ? b : a);

    return _Card(
      title: 'Diversification',
      subtitle: '${(largest * 100).round()}% sits in '
          '${biggest.instrument.name}.',
      child: Center(
        child: GaugeChart(
          value: score.toDouble(),
          size: 150,
          label: '$score',
          sublabel: score >= 75
              ? 'Well spread'
              : score >= 50
                  ? 'Reasonable'
                  : score >= 25
                      ? 'Concentrated'
                      : 'Very concentrated',
        ),
      ),
    );
  }
}

/// How many holdings fall in each return band.
class ReturnDistributionCard extends StatelessWidget {
  const ReturnDistributionCard({required this.snap, super.key});

  final PortfolioSnapshot snap;

  /// Upper bound of each band, as a fraction. The last is open-ended.
  static const _bands = <({double upTo, String label})>[
    (upTo: -0.20, label: '<-20%'),
    (upTo: -0.10, label: '-20..-10'),
    (upTo: 0.0, label: '-10..0'),
    (upTo: 0.10, label: '0..10'),
    (upTo: 0.20, label: '10..20'),
    (upTo: 0.30, label: '20..30'),
    (upTo: double.infinity, label: '30%+'),
  ];

  @override
  Widget build(BuildContext context) {
    final counts = List<int>.filled(_bands.length, 0);
    var undefined = 0;
    for (final p in snap.positions) {
      final r = _returnOf(p);
      if (r == null) {
        undefined++;
        continue;
      }
      for (var i = 0; i < _bands.length; i++) {
        if (r <= _bands[i].upTo || i == _bands.length - 1) {
          counts[i]++;
          break;
        }
      }
    }

    return _Card(
      title: 'Return spread',
      subtitle: undefined > 0
          ? '$undefined holding${undefined == 1 ? '' : 's'} with no cost to '
              'measure against are left out.'
          : 'Holdings per return band.',
      child: BarChart(
        groups: [
          for (var i = 0; i < _bands.length; i++)
            BarGroup(
              label: _bands[i].label,
              bars: [
                Bar(
                  label: 'Holdings',
                  value: counts[i].toDouble(),
                  // Coloured by which side of zero the band sits on, so the
                  // shape of the distribution is readable before the labels are.
                  color: _bands[i].upTo <= 0
                      ? AppColors.expense
                      : AppColors.income,
                ),
              ],
            ),
        ],
        height: 130,
        formatValue: (v) => '${v.round()} holdings',
        formatAxis: (v) => v.round().toString(),
        semanticLabel: 'Number of holdings in each return band',
      ),
    );
  }
}

/// The facts a person would otherwise scan the table for.
///
/// Was two cards. "Concentration" and "At a glance" both opened with the
/// largest position, its share and its value — the same three facts, rounded
/// differently, so the screen said 23.6% in one card and 24% in the other and
/// invited the reader to work out which was right. Two cards that disagree
/// about the same number are worse than one card, and a dashboard that repeats
/// itself is the clearest signal that nobody read it end to end.
class PortfolioInsightsCard extends StatelessWidget {
  const PortfolioInsightsCard({required this.snap, super.key});

  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context) {
    final positions = snap.positions;
    if (positions.isEmpty) return const SizedBox.shrink();

    final priced = positions.where((p) => _returnOf(p) != null).toList();
    final sorted = [...positions]
      ..sort((a, b) => b.marketValue.compareTo(a.marketValue));
    final largest = sorted.first;
    final smallest = sorted.last;
    final topThree =
        sorted.take(3).fold(Decimal.zero, (s, p) => s + p.marketValue);
    final best = priced.isEmpty
        ? null
        : priced.reduce((a, b) => _returnOf(b)! > _returnOf(a)! ? b : a);
    final worst = priced.isEmpty
        ? null
        : priced.reduce((a, b) => _returnOf(b)! < _returnOf(a)! ? b : a);

    final total = positions.fold(Decimal.zero, (s, p) => s + p.marketValue);
    final invested = positions.fold(Decimal.zero, (s, p) => s + p.costBasis);

    // One rounding, used everywhere on this card. The duplicate cards differed
    // only because each did its own.
    String share(Decimal v) => total <= Decimal.zero
        ? '—'
        : '${((v / total).toDouble() * 100).toStringAsFixed(1)}%';

    return _Card(
      title: 'Concentration and extremes',
      child: Column(
        children: [
          _InsightRow(
            label: 'Largest',
            value: largest.instrument.name,
            detail: '${share(largest.marketValue)} · '
                '${Money.format(largest.marketValue)}',
          ),
          _InsightRow(
            label: 'Top three',
            value: share(topThree),
            detail: Money.format(topThree),
          ),
          _InsightRow(
            label: 'Smallest',
            value: smallest.instrument.name,
            detail: '${share(smallest.marketValue)} · '
                '${Money.format(smallest.marketValue)}',
          ),
          if (best != null)
            _InsightRow(
              label: 'Best return',
              value: best.instrument.name,
              detail: _pct(_returnOf(best)!),
              detailColor: AppColors.income,
            ),
          if (worst != null && !identical(worst, best))
            _InsightRow(
              label: 'Worst return',
              value: worst.instrument.name,
              detail: _pct(_returnOf(worst)!),
              detailColor: AppColors.expense,
            ),
          _InsightRow(
            label: 'Invested',
            value: Money.format(invested),
            detail: '${positions.length} positions · avg '
                '${Money.format((total / Decimal.fromInt(positions.length)).toDecimal(scaleOnInfinitePrecision: 2))}',
          ),
        ],
      ),
    );
  }
}

class _InsightRow extends StatelessWidget {
  const _InsightRow({
    required this.label,
    required this.value,
    this.detail,
    this.detailColor,
  });

  final String label;
  final String value;
  final String? detail;
  final Color? detailColor;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 84,
            child: Text(label, style: text.bodySmall?.copyWith(color: muted)),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                // One line, ellipsised. A holding name wrapping to three lines
                // made every row a different height and the column ragged —
                // which is most of what "unfinished" looks like on a dense
                // screen.
                Text(value,
                    textAlign: TextAlign.right,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: text.bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w700)),
                ?detail == null
                    ? null
                    : Text(detail!,
                        style: text.bodySmall
                            ?.copyWith(color: detailColor ?? muted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Movement since the previous recorded price, per holding.
///
/// Not called "Today's P&L". Refresh here is user-initiated, so the previous
/// price can be a week old — labelling that as today's move would be a lie told
/// every time the screen opens. The card names the date it is measuring from.
class DayChangeCard extends ConsumerWidget {
  const DayChangeCard({required this.snap, super.key});

  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final moves = ref.watch(priceMovesProvider).valueOrNull;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    if (moves == null || moves.isEmpty) {
      return _Card(
        title: 'Change since last price',
        subtitle: 'Needs prices from two different days. Refresh again '
            'tomorrow and the move appears here.',
        child: const SizedBox(height: 24),
      );
    }

    final rows = <({Position p, PriceMove m, Decimal value})>[];
    var total = Decimal.zero;
    DateTime? oldest;
    for (final p in snap.positions) {
      final m = moves[p.instrument.id];
      if (m == null) continue;
      final value = m.delta * p.quantity;
      total += value;
      rows.add((p: p, m: m, value: value));
      if (oldest == null || m.since.isBefore(oldest)) oldest = m.since;
    }
    if (rows.isEmpty) {
      return const SizedBox.shrink();
    }
    rows.sort((a, b) => b.value.compareTo(a.value));

    return _Card(
      title: 'Change since last price',
      subtitle: 'Measured from ${_date(oldest!)}. '
          '${total >= Decimal.zero ? 'Up' : 'Down'} '
          '${Money.format(total.abs())} across ${rows.length} holding'
          '${rows.length == 1 ? '' : 's'}.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            Money.formatSigned(total, isIncome: total >= Decimal.zero),
            style: text.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: total >= Decimal.zero
                  ? AppColors.income
                  : AppColors.expense,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          DivergingBarChart(
            bars: [
              for (final r in rows)
                DivergingBar(
                  label: r.p.instrument.name,
                  value: r.value.toDouble(),
                  detail: _pct(r.m.fraction.toDouble()),
                ),
            ],
            formatValue: (v) =>
                Money.format(Decimal.parse(v.toStringAsFixed(2))),
            semanticLabel: 'Change per holding since the previous price',
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            'Prices move when you refresh, not continuously — this is the gap '
            'between the last two prices Khazana holds.',
            style: text.bodySmall?.copyWith(color: muted),
          ),
        ],
      ),
    );
  }

  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  static String _date(DateTime d) => '${d.day} ${_months[d.month - 1]}';
}

/// Allocation, switchable between what was paid and what it is worth.
///
/// Was two donuts side by side. With eight slices each and no legend between
/// them, neither was readable: the colours were traceable in principle and in
/// practice nobody can hold sixteen arcs in mind to compare them. One donut at
/// a time, with its legend, answers the same question by being switched.
class CostVsValueCard extends StatefulWidget {
  const CostVsValueCard({required this.snap, super.key});

  final PortfolioSnapshot snap;

  @override
  State<CostVsValueCard> createState() => _CostVsValueCardState();
}

class _CostVsValueCardState extends State<CostVsValueCard> {
  bool _showInvested = false;

  @override
  Widget build(BuildContext context) {
    final positions = [...widget.snap.positions]
      ..sort((a, b) => b.marketValue.compareTo(a.marketValue));
    if (positions.isEmpty) return const SizedBox.shrink();

    final invested = positions.fold(Decimal.zero, (s, p) => s + p.costBasis);
    final current = positions.fold(Decimal.zero, (s, p) => s + p.marketValue);
    final pnl = current - invested;

    Decimal pick(Position p) => _showInvested ? p.costBasis : p.marketValue;
    final grand = _showInvested ? invested : current;

    return _Card(
      title: _showInvested ? 'Allocation by amount invested' : 'Allocation by value',
      subtitle: '${Money.format(invested)} invested is now '
          '${Money.format(current)} — '
          '${pnl >= Decimal.zero ? 'up' : 'down'} ${Money.format(pnl.abs())}.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: false, label: Text('Now')),
              ButtonSegment(value: true, label: Text('Invested')),
            ],
            selected: {_showInvested},
            showSelectedIcon: false,
            onSelectionChanged: (v) =>
                setState(() => _showInvested = v.first),
          ),
          const SizedBox(height: AppSpacing.md),
          DonutChart(
            segments: [
              for (var i = 0; i < positions.length && i < 8; i++)
                DonutSegment(positions[i].instrument.name,
                    pick(positions[i]).toDouble(),
                    _sliceColors[i % _sliceColors.length]),
            ],
            size: 130,
            strokeWidth: 18,
            centerText: Money.compact(grand.toDouble()),
            formatValue: (v) =>
                Money.format(Decimal.parse(v.toStringAsFixed(2))),
          ),
        ],
      ),
    );
  }
}

/// Holdings ranked by what they are worth.
class ValueDistributionCard extends StatelessWidget {
  const ValueDistributionCard({required this.snap, this.limit = 10, super.key});

  final PortfolioSnapshot snap;
  final int limit;

  @override
  Widget build(BuildContext context) {
    final positions = [...snap.positions]
      ..sort((a, b) => b.marketValue.compareTo(a.marketValue));
    if (positions.isEmpty) return const SizedBox.shrink();

    final total = positions.fold(Decimal.zero, (s, p) => s + p.marketValue);
    final shown = positions.take(limit).toList();

    return _Card(
      title: 'Biggest holdings',
      subtitle: positions.length > shown.length
          ? 'Top ${shown.length} of ${positions.length} by value.'
          : 'By value.',
      child: DivergingBarChart(
        // Values are all positive here, so the spine sits at the left edge of
        // the ink rather than the middle — the same widget reads as a plain
        // ranked bar chart when nothing is negative.
        bars: [
          for (final p in shown)
            DivergingBar(
              label: p.instrument.name,
              value: p.marketValue.toDouble(),
              detail: total <= Decimal.zero
                  ? null
                  : '${((p.marketValue / total).toDouble() * 100).toStringAsFixed(1)}%',
            ),
        ],
        positiveColor: AppColors.accent,
        formatValue: (v) => Money.compact(v),
        semanticLabel: 'Holdings ranked by current value',
      ),
    );
  }
}

/// Top gainers and top losers, ranked by return percentage.
///
/// Percentage, not rupees: the rupee ranking is already the diverging chart
/// above, and it answers a different question. A ₹500 gain on a ₹1,000 position
/// is the best thing in the portfolio and would sit at the bottom of a rupee
/// ranking.
class GainersLosersCard extends StatelessWidget {
  const GainersLosersCard({required this.snap, this.gainers = true, super.key});

  final PortfolioSnapshot snap;
  final bool gainers;

  @override
  Widget build(BuildContext context) {
    final scored = <({Position p, double r})>[
      for (final p in snap.positions)
        if (_returnOf(p) case final r?) (p: p, r: r),
    ];
    if (scored.isEmpty) return const SizedBox.shrink();

    scored.sort((a, b) => gainers ? b.r.compareTo(a.r) : a.r.compareTo(b.r));
    final shown = scored
        .where((e) => gainers ? e.r > 0 : e.r < 0)
        .take(5)
        .toList();

    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final color = gainers ? AppColors.income : AppColors.expense;
    // Bars are scaled within THIS card, so the best gainer fills the row. The
    // two cards are not on a shared scale and do not claim to be — each answers
    // "who leads this group", not "are gains bigger than losses". That question
    // is the diverging chart's.
    final extent =
        shown.isEmpty ? 1.0 : shown.map((e) => e.r.abs()).reduce((a, b) => a > b ? a : b);

    return _Card(
      title: gainers ? 'Top gainers' : 'Top losers',
      subtitle: shown.isEmpty
          ? (gainers ? 'Nothing is up yet.' : 'Nothing is down.')
          : 'By return.',
      child: Column(
        children: [
          for (var i = 0; i < shown.length; i++)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  SizedBox(
                    width: 16,
                    child: Text('${i + 1}',
                        style: text.bodySmall?.copyWith(color: muted)),
                  ),
                  SizedBox(
                    width: 150,
                    child: Text(shown[i].p.instrument.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: text.bodySmall),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(3),
                      child: LinearProgressIndicator(
                        value: (shown[i].r.abs() / extent).clamp(0.0, 1.0),
                        minHeight: 6,
                        backgroundColor:
                            Theme.of(context).colorScheme.surfaceContainerHighest,
                        valueColor: AlwaysStoppedAnimation(color),
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  SizedBox(
                    width: 62,
                    child: Text(_pct(shown[i].r),
                        textAlign: TextAlign.right,
                        style: text.bodySmall?.copyWith(
                            fontWeight: FontWeight.w700, color: color)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Allocation by whatever [by] groups a position into.
///
/// One widget for asset type and sector rather than two near-identical ones:
/// they differ only in the key, and two copies is how the sector card ends up
/// with a legend the asset card does not have.
class GroupAllocationCard extends StatelessWidget {
  const GroupAllocationCard({
    required this.snap,
    required this.title,
    required this.by,
    this.unclassifiedLabel = 'Unclassified',
    super.key,
  });

  final PortfolioSnapshot snap;
  final String title;
  final String? Function(Position) by;
  final String unclassifiedLabel;

  @override
  Widget build(BuildContext context) {
    final totals = <String, Decimal>{};
    for (final p in snap.positions) {
      final key = by(p) ?? unclassifiedLabel;
      totals[key] = (totals[key] ?? Decimal.zero) + p.marketValue;
    }
    if (totals.isEmpty) return const SizedBox.shrink();

    final entries = totals.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final grand = entries.fold(Decimal.zero, (s, e) => s + e.value);

    // Unclassified is pushed last and greyed rather than being given a hue.
    // It is the absence of a category, and colouring it like one puts "not
    // known" on the same footing as "Energy".
    final classified =
        entries.where((e) => e.key != unclassifiedLabel).toList();
    final unknown =
        entries.where((e) => e.key == unclassifiedLabel).toList();

    return _Card(
      title: title,
      subtitle: unknown.isEmpty
          ? null
          : '${((unknown.first.value / grand).toDouble() * 100).round()}% not '
              'classified yet.',
      child: DonutChart(
        segments: [
          for (var i = 0; i < classified.length; i++)
            DonutSegment(classified[i].key, classified[i].value.toDouble(),
                _sliceColors[i % _sliceColors.length]),
          for (final u in unknown)
            DonutSegment(u.key, u.value.toDouble(),
                Theme.of(context).colorScheme.outlineVariant),
        ],
        size: 116,
        strokeWidth: 16,
        centerText: Money.compact(grand.toDouble()),
        formatValue: (v) => Money.format(Decimal.parse(v.toStringAsFixed(2))),
      ),
    );
  }
}
