import 'package:flutter/material.dart';

import '../core/theme/semantic_colors.dart';

import '../core/theme/app_tokens.dart';
import 'glass_card.dart';

/// The one stat tile. Every "label + big number" card in the app renders through
/// this widget.
///
/// It is the union of the two private copies that used to live in
/// `dashboard_screen.dart` and `investments_screen.dart`. Those two drifted:
/// only the dashboard copy wrapped itself in [Semantics]/[ExcludeSemantics], so
/// the Investments screen read its six tiles to a screen reader as a pile of
/// unlabelled digits. Taking the union rather than picking a side is what keeps
/// that fix from being undone the next time someone reaches for a tile.
///
/// [value] is already formatted for display — this widget does no money
/// formatting, because "how do I format a rupee" is a question with one answer
/// ([Money]) and it is not this widget's answer to give. [semanticValue] is the
/// spoken form (e.g. `Money.toWords`), which differs from the glyph form often
/// enough to be worth its own parameter.
class StatTile extends StatelessWidget {
  const StatTile({
    required this.label,
    required this.value,
    this.semanticValue,
    this.footer,
    this.icon,
    this.iconColor,
    this.valueColor,
    this.emphasise = false,
    this.ghost = false,
    this.onTap,
    super.key,
  });

  /// The tile's caption, e.g. "Current value".
  final String label;

  /// Display text for the number. Ignored when [ghost] is set.
  final String value;

  /// Spoken form for assistive tech. Falls back to [value].
  final String? semanticValue;

  /// Optional third line — a timestamp, a percentage, a count.
  final String? footer;

  /// Optional leading icon chip. Tiles without one are the compact grid form.
  final IconData? icon;
  final Color? iconColor;

  /// Tints the number itself — used for signed P&L. Leave null for neutral.
  final Color? valueColor;

  /// Slightly larger number, for the one tile that is the screen's headline.
  final bool emphasise;

  /// Ghost mode hides the amount from shoulder-surfers. The tile still
  /// announces its label, so the screen stays navigable while masked.
  final bool ghost;

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final hasIcon = icon != null;
    final tint = iconColor ?? context.colors.accent;

    // Composition mirrors the web `Kpi` exactly: the icon chip and the label
    // share ONE row, the figure sits under them, and the footer closes the
    // tile. The old layout put the chip on its own row above the label, which
    // cost a line of height, pushed the figure down, and made the mobile tile
    // read as a different component from its web twin.
    final body = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment:
          hasIcon ? MainAxisAlignment.start : MainAxisAlignment.center,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            if (hasIcon) ...[
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: tint.withValues(alpha: 0.13),
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Icon(icon, color: tint, size: 15),
              ),
              const SizedBox(width: AppSpacing.sm),
            ],
            Expanded(
              child: Text(
                label,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                      fontWeight: FontWeight.w600,
                    ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (onTap != null)
              Icon(Icons.chevron_right_rounded,
                  size: 18, color: scheme.onSurfaceVariant),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            ghost ? '••••••' : value,
            style: TextStyle(
              fontSize: emphasise ? 26 : 23,
              fontWeight: FontWeight.w700,
              // Large figures need less air between glyphs, not more.
              letterSpacing: -0.7,
              height: 1.05,
              color: valueColor,
            ),
          ),
        ),
        if (footer != null) ...[
          const SizedBox(height: 4),
          Text(
            footer!,
            style: Theme.of(context)
                .textTheme
                .labelSmall
                ?.copyWith(color: scheme.onSurfaceVariant),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ],
    );

    return Semantics(
      label: ghost ? '$label hidden' : '$label ${semanticValue ?? value}',
      button: onTap != null,
      child: GlassCard(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: ExcludeSemantics(
          child: onTap == null
              ? body
              : InkWell(
                  borderRadius: BorderRadius.circular(AppRadii.card),
                  onTap: onTap,
                  child: body,
                ),
        ),
      ),
    );
  }
}
