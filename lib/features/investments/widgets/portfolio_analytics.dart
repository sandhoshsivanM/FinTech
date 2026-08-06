import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/services/portfolio_analytics.dart';
import '../../../presentation/charts/bar_chart.dart';
import '../../../presentation/charts/diverging_bar_chart.dart';
import '../../../presentation/charts/donut_chart.dart';
import '../../../presentation/charts/gauge_chart.dart';
import '../../../presentation/glass_card.dart';

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
        size: 130,
        strokeWidth: 18,
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

/// The handful of facts a person would otherwise scan the table for.
class PortfolioInsightsCard extends StatelessWidget {
  const PortfolioInsightsCard({required this.snap, super.key});

  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context) {
    final positions = snap.positions;
    if (positions.isEmpty) return const SizedBox.shrink();

    final priced = positions.where((p) => _returnOf(p) != null).toList();
    final biggest =
        positions.reduce((a, b) => b.marketValue > a.marketValue ? b : a);
    final best = priced.isEmpty
        ? null
        : priced.reduce((a, b) => _returnOf(b)! > _returnOf(a)! ? b : a);
    final worst = priced.isEmpty
        ? null
        : priced.reduce((a, b) => _returnOf(b)! < _returnOf(a)! ? b : a);
    final total =
        positions.fold(Decimal.zero, (s, p) => s + p.marketValue);

    return _Card(
      title: 'At a glance',
      child: Column(
        children: [
          _InsightRow(
            label: 'Largest position',
            value: biggest.instrument.name,
            detail: total <= Decimal.zero
                ? null
                : '${((biggest.marketValue / total).toDouble() * 100).round()}%'
                    ' · ${Money.format(biggest.marketValue)}',
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
            label: 'Average position',
            value: Money.format(
              (total / Decimal.fromInt(positions.length))
                  .toDecimal(scaleOnInfinitePrecision: 2),
            ),
            detail: '${positions.length} holdings',
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
            width: 120,
            child: Text(label, style: text.bodySmall?.copyWith(color: muted)),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(value,
                    textAlign: TextAlign.right,
                    maxLines: 2,
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
