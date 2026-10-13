import 'package:flutter/material.dart';

import '../core/help/info_hint.dart';
import '../core/theme/app_tokens.dart';
import '../features/home/home_palette.dart';
import '../features/home/widgets/depth.dart';
import 'glass_card.dart';

/// A quiet type chip: "Health", "Term", "Savings". Sentence case, no caps.
class TypeChip extends StatelessWidget {
  const TypeChip(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    final p = HomePalette.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: dark ? const Color(0xFF222226) : Colors.white,
        borderRadius: BorderRadius.circular(999),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: dark ? 0.4 : 0.08),
            blurRadius: 4,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 11.5, color: p.muted, height: 1.3),
      ),
    );
  }
}

/// A small flat round icon button: the Zentra action, not a glossy tile.
class IconAction extends StatelessWidget {
  const IconAction({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    super.key,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final p = HomePalette.of(context);
    return IconButton(
      icon: Icon(icon, size: 19, color: p.muted),
      tooltip: tooltip,
      onPressed: onPressed,
      visualDensity: VisualDensity.compact,
    );
  }
}

/// One labelled gauge row: name on the left, "spent / limit" on the right and
/// a thick glossy gauge underneath.
class GaugeRow extends StatelessWidget {
  const GaugeRow({
    required this.label,
    required this.fraction,
    required this.hue,
    this.value,
    this.limit,
    this.leading,
    super.key,
  });

  final String label;
  final double fraction;
  final Hue hue;
  final String? value;
  final String? limit;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final p = HomePalette.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            if (leading != null) ...[leading!, const SizedBox(width: 8)],
            Expanded(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 13.5, color: p.ink),
              ),
            ),
            if (value != null)
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: value,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: p.ink,
                      ),
                    ),
                    if (limit != null)
                      TextSpan(
                        text: ' / $limit',
                        style: TextStyle(color: p.muted),
                      ),
                  ],
                ),
                style: const TextStyle(
                  fontSize: 12.5,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        Gauge(fraction: fraction, hue: hue),
      ],
    );
  }
}

/// A raised card holding a title and a recessed tray of content.
class TrayCard extends StatelessWidget {
  const TrayCard({
    required this.title,
    required this.child,
    this.footer,
    this.help,
    super.key,
  });

  final String? help;
  final String title;
  final Widget child;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SizedBox(
      width: double.infinity,
      child: GlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (help == null)
              Text(title, style: text.titleMedium)
            else
              InfoHint.titled(Text(title, style: text.titleMedium), help!),
            const SizedBox(height: AppSpacing.md),
            HomeTray(child: child),
            if (footer != null) ...[
              const SizedBox(height: AppSpacing.md),
              footer!,
            ],
          ],
        ),
      ),
    );
  }
}

/// Two cards per row, with a gap; a lone last child takes half a row.
class KpiGrid extends StatelessWidget {
  const KpiGrid({required this.children, super.key});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var i = 0; i < children.length; i += 2) {
      if (i > 0) rows.add(const SizedBox(height: AppSpacing.md));
      rows.add(
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(child: children[i]),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: i + 1 < children.length
                    ? children[i + 1]
                    : const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      );
    }
    return Column(children: rows);
  }
}

/// The score ring: a 270 degree blue gradient arc with round caps and a soft
/// glow, a large light number in the middle and a muted label under it.
class ScoreRing extends StatelessWidget {
  const ScoreRing({
    required this.value,
    required this.label,
    this.size = 150,
    this.weakBelow,
    super.key,
  });

  /// Below this value the arc turns pink: colour only when a part is weak.
  final double? weakBelow;

  /// 0 to 100, or null while untracked.
  final double? value;
  final String label;
  final double size;

  @override
  Widget build(BuildContext context) {
    final p = HomePalette.of(context);
    final reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final v = ((value ?? 0) / 100).clamp(0.0, 1.0);
    final weak = value != null && weakBelow != null && value! < weakBelow!;
    return Semantics(
      label: value == null
          ? 'Score not available'
          : 'Score ${value!.round()} out of 100, $label',
      child: ExcludeSemantics(
        child: SizedBox(
          width: size,
          height: size,
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: v),
            duration: reduce
                ? Duration.zero
                : const Duration(milliseconds: 1100),
            curve: Curves.easeOutCubic,
            builder: (context, t, _) => CustomPaint(
              painter: _RingPainter(
                t,
                track: p.line,
                from: weak
                    ? const Color(0xFFF33688)
                    : Theme.of(context).brightness == Brightness.dark
                    ? const Color(0xFF3D86FF)
                    : const Color(0xFF224DE0),
                to: weak ? const Color(0xFFFD6FAB) : const Color(0xFF4691FE),
                glow: weak ? p.rose : p.blue,
              ),
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      value == null ? '—' : '${value!.round()}',
                      style: TextStyle(
                        fontSize: size * 0.27,
                        fontWeight: FontWeight.w300,
                        letterSpacing: -1,
                        height: 1,
                        color: p.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(label, style: TextStyle(fontSize: 12, color: p.muted)),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter(
    this.t, {
    required this.track,
    required this.from,
    required this.to,
    required this.glow,
  });

  final double t;
  final Color track;
  final Color from;
  final Color to;
  final Color glow;

  static const _start = 135 * 3.1415926535 / 180;
  static const _sweep = 270 * 3.1415926535 / 180;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * 0.085;
    final rect = Rect.fromCircle(
      center: size.center(Offset.zero),
      radius: size.width / 2 - stroke,
    );
    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(rect, _start, _sweep, false, base..color = track);
    if (t <= 0) return;
    canvas.drawArc(
      rect,
      _start,
      _sweep * t,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.round
        ..color = glow.withValues(alpha: 0.35)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );
    canvas.drawArc(
      rect,
      _start,
      _sweep * t,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.round
        ..shader = SweepGradient(
          startAngle: _start,
          endAngle: _start + _sweep,
          colors: [from, to],
          transform: const GradientRotation(0),
        ).createShader(rect),
    );
  }

  @override
  bool shouldRepaint(covariant _RingPainter old) =>
      old.t != t || old.track != track || old.glow != glow;
}
