import 'package:flutter/material.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/portfolio.dart';
import '../../../domain/services/portfolio_analytics.dart';
import '../../../presentation/glass_card.dart';

/// Where every price in the portfolio came from, and when.
///
/// Refreshing prices already worked — AMFI and Yahoo are both reachable without
/// an API key and the service reports partial failures honestly. But the whole
/// thing was one icon button and a snackbar that vanished after four seconds,
/// so there was no way to answer "is this number live?" a minute later. A
/// portfolio total is only as trustworthy as its oldest price, and that fact
/// was unreadable.
///
/// This card is deliberately not a live ticker. Prices move when the user asks
/// them to and not otherwise — see `PriceRefreshService` — so what matters is
/// showing the age and provenance of what is on screen, not animating it.
class MarketDataCard extends StatefulWidget {
  const MarketDataCard({
    required this.snap,
    required this.refreshButton,
    this.lastRefreshedAt,
    super.key,
  });

  final PortfolioSnapshot snap;

  /// The existing refresh control, passed in so this card does not own the
  /// network call or duplicate its busy/error handling.
  final Widget refreshButton;

  /// When the user last ran a refresh, as opposed to the date a price carries.
  /// A run that reaches every provider and finds nothing new still counts.
  final DateTime? lastRefreshedAt;

  @override
  State<MarketDataCard> createState() => _MarketDataCardState();
}

class _MarketDataCardState extends State<MarketDataCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final positions = widget.snap.positions;

    if (positions.isEmpty) return const SizedBox.shrink();

    // Count by quality rather than by source: a user cares that eight holdings
    // carry a live quote, not that six came from Yahoo and two from TwelveData.
    final byQuality = <PriceQuality, int>{};
    var unpriced = 0;
    DateTime? oldest;
    for (final p in positions) {
      if (p.isUnpriced) {
        unpriced++;
        continue;
      }
      final q = p.priceQuality;
      if (q != null) byQuality[q] = (byQuality[q] ?? 0) + 1;
      final at = p.pricedAt;
      // unknownDate carries a fabricated timestamp (the migration's own run
      // time), so it must not be allowed to set "oldest price" — it would
      // report a date that never described the price.
      if (at != null && q != PriceQuality.unknownDate) {
        if (oldest == null || at.isBefore(oldest)) oldest = at;
      }
    }

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.speed_outlined, size: 18, color: muted),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text('Market data',
                    style:
                        text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
              ),
              widget.refreshButton,
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            _summary(byQuality, unpriced, oldest, widget.lastRefreshedAt),
            style: text.bodySmall?.copyWith(color: muted, height: 1.4),
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: [
              for (final q in PriceQuality.values)
                if ((byQuality[q] ?? 0) > 0)
                  _QualityChip(quality: q, count: byQuality[q]!),
              if (unpriced > 0)
                _QualityChip(quality: null, count: unpriced),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => setState(() => _expanded = !_expanded),
              icon: Icon(
                  _expanded ? Icons.expand_less : Icons.expand_more,
                  size: 18),
              label: Text(_expanded
                  ? 'Hide price sources'
                  : 'Show price for each holding'),
            ),
          ),
          if (_expanded) ...[
            const Divider(height: 1),
            const SizedBox(height: AppSpacing.sm),
            for (final p in _sorted(positions))
              _PriceRow(position: p),
          ],
        ],
      ),
    );
  }

  /// Least trustworthy first. The holdings a user needs to act on — never
  /// priced, priced by hand — are the ones that must not be buried under
  /// twenty rows of healthy live quotes.
  static List<Position> _sorted(List<Position> positions) {
    int rank(Position p) {
      if (p.isUnpriced) return 0;
      return switch (p.priceQuality) {
        PriceQuality.unknownDate => 1,
        PriceQuality.indicative => 2,
        PriceQuality.stale => 3,
        PriceQuality.official => 4,
        PriceQuality.live => 5,
        null => 0,
      };
    }

    return [...positions]..sort((a, b) {
        final byRank = rank(a).compareTo(rank(b));
        return byRank != 0
            ? byRank
            : a.instrument.name.compareTo(b.instrument.name);
      });
  }

  static String _summary(
    Map<PriceQuality, int> byQuality,
    int unpriced,
    DateTime? oldest,
    DateTime? lastRefreshedAt,
  ) {
    final live = byQuality[PriceQuality.live] ?? 0;
    final official = byQuality[PriceQuality.official] ?? 0;
    final quoted = live + official;

    final parts = <String>[];
    if (quoted == 0) {
      parts.add('No holding carries a market quote yet — every value below is '
          'a price you entered or the cost you paid.');
    } else {
      parts.add('$quoted of ${quoted + unpriced + (byQuality[PriceQuality.stale] ?? 0) + (byQuality[PriceQuality.indicative] ?? 0) + (byQuality[PriceQuality.unknownDate] ?? 0)} '
          'holdings carry a market quote.');
    }
    if (oldest != null) {
      parts.add('Oldest price ${_ago(oldest)}.');
    }
    parts.add(lastRefreshedAt == null
        ? 'Never refreshed on this device.'
        : 'Last checked ${_ago(lastRefreshedAt)}.');
    return parts.join(' ');
  }

  /// Relative time, floored rather than rounded.
  ///
  /// Rounding up lets a price fetched 20 hours ago read "yesterday" and one
  /// fetched 30 hours ago read "yesterday" too. For a number someone may trade
  /// on, erring old is the safe direction.
  static String _ago(DateTime t) {
    final d = DateTime.now().difference(t);
    if (d.inMinutes < 1) return 'just now';
    if (d.inMinutes < 60) return '${d.inMinutes} min ago';
    if (d.inHours < 24) return '${d.inHours}h ago';
    if (d.inDays == 1) return 'yesterday';
    if (d.inDays < 30) return '${d.inDays} days ago';
    return '${(d.inDays / 30).floor()} months ago';
  }
}

/// A count of holdings at one confidence level. Null [quality] means unpriced.
class _QualityChip extends StatelessWidget {
  const _QualityChip({required this.quality, required this.count});

  final PriceQuality? quality;
  final int count;

  @override
  Widget build(BuildContext context) {
    final (label, color) = describeQuality(quality);
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Text(
        '$count $label',
        style: TextStyle(
            fontSize: 12, fontWeight: FontWeight.w600, color: color),
      ),
    );
  }
}

/// One label and colour per confidence level, shared by the chips and the rows
/// so a holding cannot be described one way in the summary and another below.
(String, Color) describeQuality(PriceQuality? q) => switch (q) {
      PriceQuality.live => ('live', AppColors.income),
      PriceQuality.official => ('official NAV', AppColors.accent),
      PriceQuality.stale => ('cached', AppColors.budgetWarn),
      PriceQuality.indicative => ('manual', AppColors.budgetWarn),
      PriceQuality.unknownDate => ('date unknown', AppColors.budgetWarn),
      null => ('not priced', AppColors.expense),
    };

class _PriceRow extends StatelessWidget {
  const _PriceRow({required this.position});

  final Position position;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    var (label, color) = describeQuality(position.priceQuality);

    // A price can be genuinely official and still be four years old: AMFI keeps
    // publishing discontinued schemes, so a wound-up fund's last NAV resolves
    // perfectly and then sits there looking authoritative. Age is a separate
    // axis from provenance, and past a week it is the one that matters.
    final at = position.pricedAt;
    final stale = at != null &&
        position.priceQuality != PriceQuality.unknownDate &&
        DateTime.now().difference(at).inDays > 7;
    if (stale) {
      label = 'stale';
      color = AppColors.budgetWarn;
    }

    // The date is suppressed for unknownDate on purpose: that timestamp is the
    // migration's run time, not an observation, and printing it would dress a
    // fiction up as a fact.
    final showDate = position.pricedAt != null &&
        position.priceQuality != PriceQuality.unknownDate;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        children: [
          Container(
            width: 6,
            height: 6,
            margin: const EdgeInsets.only(right: AppSpacing.sm),
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(position.instrument.name,
                    style: text.bodyMedium, maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                Text(
                  [
                    label,
                    if (position.priceSource != null) position.priceSource!.label,
                    if (showDate) _date(position.pricedAt!),
                  ].join(' · '),
                  style: text.bodySmall?.copyWith(color: muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(
            position.price == null
                ? 'at cost'
                : Money.format(position.price!),
            style: text.bodyMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: position.price == null ? muted : null,
            ),
          ),
        ],
      ),
    );
  }

  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  static String _date(DateTime d) {
    final today = DateTime.now();
    if (d.year == today.year && d.month == today.month && d.day == today.day) {
      return 'today';
    }
    return '${d.day} ${_months[d.month - 1]}';
  }
}
