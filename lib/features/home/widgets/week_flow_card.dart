import '../../../core/help/info_hint.dart';
import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/money_format.dart';
import 'package:khazana_domain/services/daily_flow.dart';
import '../../reports/providers/dashboard_providers.dart';
import '../home_palette.dart';
import '../home_providers.dart';

const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _months = [
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
String _long(DateTime d) =>
    '${_weekdays[d.weekday - 1]}, ${d.day} ${_months[d.month - 1]}';

/// Last 7 days: money in above the line, money out below, one shared scale,
/// drawn as extruded 3D striped bars; the selected day goes solid.
///
/// Shared on purpose — a salary day dwarfs a week of coffees, and separate
/// scales would hide exactly that. Tapping a day shows its exact figures. The
/// twin of `webapp/src/components/home/WeekFlowCard.tsx`.
class WeekFlowCard extends ConsumerStatefulWidget {
  const WeekFlowCard({super.key});

  @override
  ConsumerState<WeekFlowCard> createState() => _WeekFlowCardState();
}

class _WeekFlowCardState extends ConsumerState<WeekFlowCard> {
  int? _picked;

  @override
  Widget build(BuildContext context) {
    final days = ref.watch(weekFlowProvider);
    final fortnight = ref.watch(fortnightFlowProvider);
    final ghost = ref.watch(ghostModeProvider);
    final p = HomePalette.of(context);
    final text = Theme.of(context).textTheme;

    Decimal out(List<DayFlow> ds) =>
        ds.fold(Decimal.zero, (s, d) => s + d.expense);
    final weekOut = out(days);
    final change = fortnight.length == 14
        ? describeChange(weekOut, out(fortnight.sublist(0, 7)))
        : null;
    final peak = days.reduce((a, d) => d.expense > a.expense ? d : a);
    final sel = _picked ?? days.length - 1;
    final day = days[sel];
    String money(Decimal v) => ghost ? '••••' : Money.format(v);
    final reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;

    return HomeGroup(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    InfoHint.titled(
                      Text(
                        'Last 7 days',
                        style: text.titleSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: p.ink,
                        ),
                      ),
                      'dashboard.lastSevenDays',
                    ),
                    const SizedBox(height: 8),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        money(weekOut),
                        style: TextStyle(
                          fontSize: 34,
                          fontWeight: FontWeight.w300,
                          letterSpacing: -0.6,
                          height: 1,
                          color: p.ink,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Text(
                          'spent this week',
                          style: TextStyle(fontSize: 12, color: p.muted),
                        ),
                        const SizedBox(width: 10),
                        for (final (label, color) in [
                          ('In', p.green),
                          ('Out', p.rose),
                        ]) ...[
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: color,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            label,
                            style: TextStyle(fontSize: 12, color: p.muted),
                          ),
                          const SizedBox(width: 8),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (peak.expense > Decimal.zero)
                    _Chip(
                      children: [
                        TextSpan(
                          text: 'Peak: ',
                          style: TextStyle(color: p.muted),
                        ),
                        TextSpan(
                          text: _weekdays[peak.day.weekday - 1],
                          style: TextStyle(
                            color: p.ink,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  if (change != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      'vs last week',
                      style: TextStyle(fontSize: 12, color: p.muted),
                    ),
                    // An icon, not "↑"/"↓": the bundled font has no arrow
                    // glyphs, and the fallback drew a missing-glyph box.
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          change.up
                              ? Icons.arrow_upward_rounded
                              : Icons.arrow_downward_rounded,
                          size: 15,
                          color: change.up ? p.rose : p.green,
                          semanticLabel: change.up ? 'up' : 'down',
                        ),
                        const SizedBox(width: 2),
                        Text(
                          change.text,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: change.up ? p.rose : p.green,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ],
          ),
          const SizedBox(height: 14),
          // Recessed tray holding the chart.
          HomeTray(
            padding: const EdgeInsets.fromLTRB(8, 12, 8, 6),
            child: Column(
              children: [
                TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: 1),
                  duration: reduce
                      ? Duration.zero
                      : const Duration(milliseconds: 800),
                  curve: Curves.easeOutCubic,
                  builder: (context, grow, _) => AspectRatio(
                    aspectRatio: 336 / 145,
                    child: LayoutBuilder(
                      builder: (context, box) => GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTapDown: (d) => setState(
                          () =>
                              _picked = (d.localPosition.dx / box.maxWidth * 7)
                                  .floor()
                                  .clamp(0, 6),
                        ),
                        child: Semantics(
                          label: 'Income and spending per day',
                          child: CustomPaint(
                            size: Size(box.maxWidth, box.maxHeight),
                            painter: _WeekPainter(
                              days: days,
                              selected: sel,
                              grow: grow,
                              palette: p,
                              axis: p.line,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    for (var i = 0; i < 7; i++)
                      Expanded(
                        child: Semantics(
                          button: true,
                          selected: i == sel,
                          label:
                              '${_long(days[i].day)}: in ${money(days[i].income)}, '
                              'out ${money(days[i].expense)}',
                          excludeSemantics: true,
                          child: GestureDetector(
                            onTap: () => setState(() => _picked = i),
                            behavior: HitTestBehavior.opaque,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              child: Text(
                                i == 6
                                    ? 'Today'
                                    : _weekdays[days[i].day.weekday - 1],
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: i == sel
                                      ? FontWeight.w600
                                      : FontWeight.w400,
                                  color: i == sel ? p.ink : p.muted,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          // The picked day, as a glass readout.
          Semantics(
            liveRegion: true,
            child: Center(
              child: _Chip(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 9,
                ),
                children: [
                  TextSpan(
                    text: sel == 6 ? 'Today' : _long(day.day),
                    style: TextStyle(color: p.ink, fontWeight: FontWeight.w600),
                  ),
                  TextSpan(
                    text: '  |  In ',
                    style: TextStyle(color: p.muted),
                  ),
                  TextSpan(
                    text: money(day.income),
                    style: TextStyle(
                      color: p.green,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  TextSpan(
                    text: '  |  Out ',
                    style: TextStyle(color: p.muted),
                  ),
                  TextSpan(
                    text: money(day.expense),
                    style: TextStyle(
                      color: p.rose,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  TextSpan(
                    text: '  |  Net ',
                    style: TextStyle(color: p.muted),
                  ),
                  TextSpan(
                    text: ghost
                        ? '••••'
                        : '${day.net < Decimal.zero ? '−' : '+'}'
                              '${Money.format(day.net.abs())}',
                    style: TextStyle(color: p.ink, fontWeight: FontWeight.w600),
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

/// A small raised pill — the "Peak" label and the day readout.
class _Chip extends StatelessWidget {
  const _Chip({
    required this.children,
    this.padding = const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
  });

  final List<InlineSpan> children;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final p = HomePalette.of(context);
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: p.group,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: p.line),
        boxShadow: [
          BoxShadow(
            color: p.groupShadow,
            blurRadius: 16,
            offset: const Offset(0, 6),
            spreadRadius: -10,
          ),
        ],
      ),
      child: Text.rich(
        TextSpan(children: children),
        textAlign: TextAlign.center,
        style: const TextStyle(
          fontSize: 11.5,
          fontFeatures: [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}

class _WeekPainter extends CustomPainter {
  _WeekPainter({
    required this.days,
    required this.selected,
    required this.grow,
    required this.palette,
    required this.axis,
  });

  final List<DayFlow> days;
  final int selected;
  final double grow;
  final HomePalette palette;
  final Color axis;

  @override
  void paint(Canvas canvas, Size size) {
    final col = size.width / 7;
    final pw = (col * 0.42).clamp(10.0, 18.0);
    // The midline sits at 58% of the height: money in rises from it, money out
    // hangs below it, both on one scale.
    final mid = size.height * 0.58;
    final upRoom = mid - 6;
    final downRoom = size.height - mid - 6;
    var max = 1.0;
    for (final d in days) {
      if (d.income.toDouble() > max) max = d.income.toDouble();
      if (d.expense.toDouble() > max) max = d.expense.toDouble();
    }

    for (var i = 0; i < days.length; i++) {
      final on = i == selected;
      if (on) {
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(i * col + 2, 0, col - 4, size.height),
            const Radius.circular(12),
          ),
          Paint()..color = palette.blue.withValues(alpha: 0.08),
        );
      }
    }
    canvas.drawLine(
      Offset(0, mid),
      Offset(size.width, mid),
      Paint()
        ..color = palette.ink.withValues(alpha: 0.12)
        ..strokeWidth = 1,
    );

    for (var i = 0; i < days.length; i++) {
      final cx = i * col + col / 2;
      final on = i == selected;
      final x = cx - (pw + 6) / 2;
      _bar(
        canvas,
        days[i].income.toDouble(),
        x,
        pw,
        mid,
        upRoom,
        up: true,
        max: max,
        color: palette.green,
        solid: const [Color(0xFF9AF2C0), Color(0xFF29B340)],
        on: on,
      );
      _bar(
        canvas,
        days[i].expense.toDouble(),
        x,
        pw,
        mid,
        downRoom,
        up: false,
        max: max,
        color: palette.rose,
        solid: const [Color(0xFFF33688), Color(0xFFFD6FAB)],
        on: on,
      );
    }
  }

  /// One extruded bar: a striped face, a skewed side, or a solid gradient face
  /// on the selected day.
  void _bar(
    Canvas c,
    double v,
    double x,
    double pw,
    double mid,
    double room, {
    required bool up,
    required double max,
    required Color color,
    required List<Color> solid,
    required bool on,
  }) {
    if (v <= 0) return;
    final h = (((v / max) * room).clamp(6.0, room)) * grow;
    final top = up ? mid - h : mid;
    final face = Rect.fromLTWH(x, top, pw, h);
    final rr = RRect.fromRectAndCorners(
      face,
      topLeft: Radius.circular(up ? 3 : 0),
      topRight: Radius.circular(up ? 3 : 0),
      bottomLeft: Radius.circular(up ? 0 : 3),
      bottomRight: Radius.circular(up ? 0 : 3),
    );
    // The depth: a skewed side face on the right.
    const d = 6.0;
    final side = Path()
      ..moveTo(x + pw, top + 4)
      ..lineTo(x + pw + d, top + 4 + d)
      ..lineTo(x + pw + d, top + h + d)
      ..lineTo(x + pw, top + h)
      ..close();
    c.drawPath(side, Paint()..color = color.withValues(alpha: 0.28));
    if (on) {
      c.drawRRect(
        rr,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: solid,
          ).createShader(face),
      );
      return;
    }
    c.save();
    c.clipRRect(rr);
    c.drawRect(face, Paint()..color = color.withValues(alpha: 0.18));
    final stripe = Paint()
      ..color = color
      ..strokeWidth = 2;
    for (var k = -h; k < pw + h; k += 5) {
      c.drawLine(Offset(x + k, top), Offset(x + k + h, top + h), stripe);
    }
    c.restore();
  }

  @override
  bool shouldRepaint(covariant _WeekPainter old) =>
      old.grow != grow ||
      old.selected != selected ||
      old.days != days ||
      old.palette != palette;
}
