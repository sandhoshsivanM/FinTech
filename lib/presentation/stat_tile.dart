import 'package:flutter/material.dart';

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
    final tint = iconColor ?? AppColors.accent;

    final body = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment:
          hasIcon ? MainAxisAlignment.start : MainAxisAlignment.center,
      children: [
        if (hasIcon) ...[
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: tint.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: tint, size: 18),
              ),
              if (onTap != null) ...[
                const Spacer(),
                Icon(Icons.chevron_right_rounded,
                    size: 16, color: scheme.outline),
              ],
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
        Text(
          label,
          style: (hasIcon
                  ? Theme.of(context).textTheme.labelMedium
                  : Theme.of(context).textTheme.labelSmall)
              ?.copyWith(color: scheme.onSurfaceVariant),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 2),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            ghost ? '••••••' : value,
            style: TextStyle(
              fontSize: emphasise ? 21 : 18,
              fontWeight: FontWeight.w800,
              color: valueColor,
            ),
          ),
        ),
        if (footer != null) ...[
          const SizedBox(height: 2),
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
