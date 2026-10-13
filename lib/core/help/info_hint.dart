import 'package:flutter/material.dart';

import '../../features/home/home_palette.dart';
import '../theme/app_tokens.dart';
import 'section_help.dart';

/// The small "ⓘ" that explains a section or a figure.
///
/// Pass a [SectionHelp] key (`'dashboard.netWorth'`) or a glossary term
/// (`'xirr'`). A 16px muted icon inside a 44px tap target; tapping opens a
/// popover card anchored to the icon (flipping above it near the bottom of
/// the screen). Tapping outside, or Back, dismisses it.
class InfoHint extends StatelessWidget {
  const InfoHint(this.helpKey, {this.color, super.key});

  final String helpKey;

  /// Icon colour override for use on coloured surfaces; defaults to muted.
  final Color? color;

  /// Title row: [title] followed inline by an [InfoHint].
  static Widget titled(Widget title, String helpKey) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Flexible(child: title),
      InfoHint(helpKey),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final entry = SectionHelp.of(helpKey);
    final p = HomePalette.of(context);
    return Semantics(
      label: 'What is ${entry.title}?',
      button: true,
      excludeSemantics: true,
      onTap: () => _open(context, entry),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => _open(context, entry),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Center(
            child: Icon(Icons.info_outline, size: 16, color: color ?? p.muted),
          ),
        ),
      ),
    );
  }

  void _open(BuildContext context, HelpEntry entry) {
    final box = context.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return;
    final anchor = box.localToGlobal(Offset.zero) & box.size;
    showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Close',
      barrierColor: Colors.transparent,
      transitionDuration: const Duration(milliseconds: 140),
      transitionBuilder: (_, anim, _, child) =>
          FadeTransition(opacity: anim, child: child),
      pageBuilder: (ctx, _, _) => _HelpPopover(anchor: anchor, entry: entry),
    );
  }
}

class _HelpPopover extends StatelessWidget {
  const _HelpPopover({required this.anchor, required this.entry});

  final Rect anchor;
  final HelpEntry entry;

  static const _gap = 4.0;
  static const _margin = 16.0;
  static const _maxWidth = 320.0;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final size = media.size;
    final p = HomePalette.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final width = (size.width - _margin * 2).clamp(0.0, _maxWidth);
    final left = (anchor.center.dx - width / 2).clamp(
      _margin,
      size.width - _margin - width,
    );
    final below = anchor.bottom + _gap;
    final spaceBelow = size.height - media.padding.bottom - below;
    final placeAbove = spaceBelow < 200 && anchor.top > spaceBelow;

    final card = Material(
      color: dark ? const Color(0xFF222226) : Colors.white,
      elevation: 0,
      borderRadius: BorderRadius.circular(16),
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: p.line),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: dark ? 0.5 : 0.16),
              blurRadius: 24,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: size.height * 0.5),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entry.title,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                      color: p.ink,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    entry.body,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.45,
                      color: p.muted,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );

    return Stack(
      children: [
        Positioned(
          left: left,
          width: width,
          top: placeAbove ? null : below,
          bottom: placeAbove ? size.height - anchor.top + _gap : null,
          child: Semantics(container: true, child: card),
        ),
      ],
    );
  }
}
