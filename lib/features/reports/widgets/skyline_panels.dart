import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:khazana_domain/services/skyline.dart';

import '../../../core/utils/money_format.dart';
import '../../../presentation/charts/skyline_chart.dart';
import '../providers/dashboard_providers.dart';
import '../providers/skyline_providers.dart';

/// The skyline charts as ready-to-place panels: figures on top, chart below.
/// The twin of `packages/screens-ts/src/components/SkylinePanels.tsx`.
///
/// The data comes from providers that depend only on the transactions (or
/// snapshots) and the day, so nothing elsewhere on the page recomputes them.

const _wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const _mo = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

String _dayLabel(DateTime d) =>
    '${_wd[d.weekday % 7]} ${d.day} ${_mo[d.month - 1]}';
String _shortDay(DateTime d) => '${d.day} ${_mo[d.month - 1]}';

class _Figure {
  const _Figure(this.label, this.value, {this.sub, this.tone});
  final String label;
  final String value;
  final String? sub;
  final Color? tone;
}

class _Figures extends StatelessWidget {
  const _Figures({required this.items, required this.palette});

  final List<_Figure> items;
  final SkylinePalette palette;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final cols = box.maxWidth >= 560 ? 4 : 2;
        Widget tile(_Figure f) => DecoratedBox(
          decoration: BoxDecoration(
            color: palette.tray,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  f.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: palette.muted),
                ),
                const SizedBox(height: 2),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: f.value,
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w600,
                            letterSpacing: -0.4,
                            color: f.tone ?? palette.ink,
                          ),
                        ),
                        if (f.sub != null)
                          TextSpan(
                            text: ' ${f.sub}',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: palette.muted,
                            ),
                          ),
                      ],
                    ),
                    maxLines: 1,
                    style: const TextStyle(
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
        return Column(
          children: [
            for (var r = 0; r < items.length; r += cols) ...[
              if (r > 0) const SizedBox(height: 10),
              IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var c = 0; c < cols; c++) ...[
                      if (c > 0) const SizedBox(width: 10),
                      Expanded(
                        child: r + c < items.length
                            ? tile(items[r + c])
                            : const SizedBox.shrink(),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}

/// Spending per day over a range (Home: the last 26 weeks; Reports: the
/// selected period).
class SpendSkylinePanel extends ConsumerWidget {
  const SpendSkylinePanel({
    required this.range,
    required this.today,
    this.narrowWeeks,
    this.maxWeeks,
    this.card,
    super.key,
  });

  final SkyRange range;
  final DateTime today;

  /// On a narrow card, show only this many most recent weeks.
  final int? narrowWeeks;

  /// Longest period drawn; a longer range shows its most recent weeks.
  final int? maxWeeks;

  /// The host card's fill, when it is not the Material surface.
  final Color? card;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    var r = range;
    var clipped = false;
    if (maxWeeks != null) (r, clipped) = clipToWeeks(range, maxWeeks!);
    final data = ref.watch(
      spendSkylineProvider((start: r.start, end: r.end, today: today)),
    );
    if (data == null) return const SizedBox.shrink();
    final ghost = ref.watch(ghostModeProvider);
    final palette = SkylinePalette.of(context, card: card);
    String money(Decimal v) => ghost ? '••••' : Money.format(v);
    final stats = data.stats;
    final cells = data.sky.cells;

    String describe(int i) {
      final c = cells[i];
      final label = _dayLabel(c.day);
      if (c.amount == null) return label;
      if (c.amount == Decimal.zero) return '$label · Nothing spent';
      return '$label · ${money(c.amount!)} · ${c.count} '
          '${c.count == 1 ? 'entry' : 'entries'}';
    }

    final muted = TextStyle(fontSize: 12, color: palette.muted);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Figures(
          palette: palette,
          items: [
            _Figure('Spent', money(stats.total), tone: palette.rose),
            _Figure(
              'Busiest day',
              stats.busiest == null ? '—' : money(stats.busiest!.amount!),
              sub: stats.busiest == null ? null : _shortDay(stats.busiest!.day),
            ),
            _Figure(
              'Longest no-spend run',
              '${stats.longestQuiet}',
              sub: stats.longestQuiet == 1 ? 'day' : 'days',
            ),
            _Figure(
              'No-spend days',
              '${stats.quietDays}',
              sub: 'of ${stats.pastDays}',
            ),
          ],
        ),
        if (clipped) ...[
          const SizedBox(height: 8),
          Text(
            'Showing the most recent $maxWeeks weeks of this period',
            style: muted,
          ),
        ],
        const SizedBox(height: 16),
        SkylineChart(
          cells: cells,
          describe: describe,
          narrowWeeks: narrowWeeks,
          card: card,
          semanticLabel:
              'Spending per day. ${ghost ? '' : 'Total ${Money.toWords(stats.total)}. '}'
              '${stats.quietDays} days with nothing spent.',
        ),
      ],
    );
  }
}

/// Change in portfolio value per day, from the daily snapshots.
class PortfolioSkylinePanel extends ConsumerWidget {
  const PortfolioSkylinePanel({
    required this.range,
    required this.today,
    this.narrowWeeks,
    this.card,
    super.key,
  });

  final SkyRange range;
  final DateTime today;
  final int? narrowWeeks;
  final Color? card;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(
      portfolioSkylineProvider((
        start: range.start,
        end: range.end,
        today: today,
      )),
    );
    if (data == null) return const SizedBox.shrink();
    final ghost = ref.watch(ghostModeProvider);
    final palette = SkylinePalette.of(context, card: card);
    String signed(Decimal v) => ghost
        ? '••••'
        : Money.formatSigned(v.abs(), isIncome: v >= Decimal.zero);
    final stats = data.stats;
    final cells = data.sky.cells;

    if (data.readings == 0) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Text(
          'Daily changes appear once Khazana has recorded your portfolio on '
          'two different days.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: palette.muted),
        ),
      );
    }

    String describe(int i) {
      final c = cells[i];
      final label = _dayLabel(c.day);
      if (c.amount == null) return '$label · No reading';
      final since = c.since;
      final gap = since != null && c.day.difference(since).inHours > 36
          ? ' since ${_shortDay(since)}'
          : '';
      return '$label · ${signed(c.amount!)}$gap';
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Figures(
          palette: palette,
          items: [
            _Figure(
              'Net change',
              signed(stats.net),
              tone: stats.net >= Decimal.zero ? palette.green : palette.rose,
            ),
            _Figure(
              'Best day',
              stats.best == null ? '—' : signed(stats.best!.amount!),
              sub: stats.best == null ? null : _shortDay(stats.best!.day),
            ),
            _Figure(
              'Worst day',
              stats.worst == null ? '—' : signed(stats.worst!.amount!),
              sub: stats.worst == null ? null : _shortDay(stats.worst!.day),
            ),
            _Figure('Up / down days', '${stats.upDays} / ${stats.downDays}'),
          ],
        ),
        const SizedBox(height: 16),
        SkylineChart(
          cells: cells,
          describe: describe,
          mode: SkylineMode.change,
          narrowWeeks: narrowWeeks,
          card: card,
          semanticLabel:
              'Change in portfolio value per day. ${stats.upDays} days up, '
              '${stats.downDays} down.',
        ),
        const SizedBox(height: 12),
        Text(
          'From the daily snapshot. Includes money you added, not only market '
          'moves. Days the app was not opened have no reading.',
          style: TextStyle(fontSize: 12, color: palette.muted),
        ),
      ],
    );
  }
}
