import 'package:flutter/material.dart';

/// Zentra colours for the home and the data widgets, per theme.
///
/// Neutral chrome so the data carries the colour. Never forced dark.
/// Mirrors the `--home-*` and `--data-*` tokens in
/// `webapp/src/app/globals.css`, so both clients look the same.
class HomePalette {
  const HomePalette._({
    required this.header,
    required this.ink,
    required this.muted,
    required this.fill,
    required this.line,
    required this.sheet,
    required this.group,
    required this.groupHighlight,
    required this.groupShadow,
    required this.sheetShadow,
    required this.pill,
    required this.pillInk,
    required this.blue,
    required this.blueSoft,
    required this.green,
    required this.greenSoft,
    required this.rose,
    required this.roseSoft,
    required this.insight,
  });

  final Color header;
  final Color ink;
  final Color muted;
  final Color fill;
  final Color line;
  final Color sheet;
  final Color group;

  /// The 1px top highlight that makes a panel read as a lit object.
  final Color groupHighlight;
  final Color groupShadow;
  final Color sheetShadow;

  /// The one solid control: active tab, primary action, the + button.
  final Color pill;
  final Color pillInk;

  /// Data colours: vivid, and only ever on data.
  final Color blue;
  final Color blueSoft;
  final Color green;
  final Color greenSoft;
  final Color rose;
  final Color roseSoft;

  /// The insight card's gradient stops (top-left → bottom-right).
  final List<Color> insight;

  static const light = HomePalette._(
    header: Color(0xFFF2F2F2),
    ink: Color(0xFF111214),
    muted: Color(0xFF6E6E73),
    fill: Color(0xB3FFFFFF),
    line: Color(0xFFE6E6E8),
    sheet: Color(0xFFF2F2F2),
    group: Color(0xFFF8F8F8),
    groupHighlight: Color(0xE6FFFFFF),
    groupShadow: Color(0x47111214),
    sheetShadow: Color(0x2E111214),
    pill: Color(0xFF111214),
    pillInk: Color(0xFFFFFFFF),
    blue: Color(0xFF1C6FFB),
    blueSoft: Color(0xFFB0CBFD),
    green: Color(0xFF29B340),
    greenSoft: Color(0xFF7FD48D),
    rose: Color(0xFFF33688),
    roseSoft: Color(0xFFFD6FAB),
    insight: [Color(0xFF15265B), Color(0xFF367DC0), Color(0xFFED9861)],
  );

  static const dark = HomePalette._(
    header: Color(0xFF0E0E10),
    ink: Color(0xFFF5F5F7),
    muted: Color(0xFF8E8E93),
    fill: Color(0x0FFFFFFF),
    line: Color(0xFF26262B),
    sheet: Color(0xFF0E0E10),
    group: Color(0xFF1C1C20),
    groupHighlight: Color(0x0FFFFFFF),
    groupShadow: Color(0xE6000000),
    sheetShadow: Color(0xD9000000),
    pill: Color(0xFFF5F5F7),
    pillInk: Color(0xFF111214),
    blue: Color(0xFF3D86FF),
    blueSoft: Color(0xFF1F3A66),
    green: Color(0xFF34C759),
    greenSoft: Color(0xFF7FD48D),
    rose: Color(0xFFFF4F9A),
    roseSoft: Color(0xFFFD6FAB),
    insight: [Color(0xFF15265B), Color(0xFF367DC0), Color(0xFFED9861)],
  );

  static HomePalette of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? dark : light;
}

/// A group inside the sheet: an inset, softly lit panel, not a bordered box.
class HomeGroup extends StatelessWidget {
  const HomeGroup({
    required this.child,
    this.padding = const EdgeInsets.all(18),
    super.key,
  });

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final p = HomePalette.of(context);
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: p.group,
        borderRadius: BorderRadius.circular(24),
        // Uniform: Flutter cannot round a border whose sides differ.
        border: Border.all(color: p.groupHighlight),
        boxShadow: [
          BoxShadow(
            color: p.groupShadow,
            blurRadius: 26,
            offset: const Offset(0, 10),
            spreadRadius: -18,
          ),
        ],
      ),
      child: child,
    );
  }
}

/// A recessed well inside a raised panel — the reference's "Preview" tray.
/// Raised card, recessed tray, content: depth from nesting, not decoration.
class HomeTray extends StatelessWidget {
  const HomeTray({
    required this.child,
    this.padding = const EdgeInsets.all(14),
    super.key,
  });

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: dark ? const Color(0xFF17171A) : const Color(0xFFECECEE),
        borderRadius: BorderRadius.circular(18),
      ),
      child: child,
    );
  }
}

/// A diagonal-stripe fill: texture instead of more colour. Paint inside a
/// clipped box.
class HatchPainter extends CustomPainter {
  const HatchPainter(this.color, {this.gap = 5, this.stroke = 2});

  final Color color;
  final double gap;
  final double stroke;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = color.withValues(alpha: 0.3),
    );
    final p = Paint()
      ..color = color
      ..strokeWidth = stroke;
    for (var x = -size.height; x < size.width + size.height; x += gap) {
      canvas.drawLine(Offset(x, size.height), Offset(x + size.height, 0), p);
    }
  }

  @override
  bool shouldRepaint(covariant HatchPainter old) =>
      old.color != color || old.gap != gap || old.stroke != stroke;
}
