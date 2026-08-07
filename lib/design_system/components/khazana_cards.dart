import 'package:flutter/material.dart';

import '../tokens/khazana_colors.dart';
import '../tokens/khazana_metrics.dart';

/// The card primitives. The Flutter twins of `webapp/src/components/ui.tsx`.
///
/// Before these existed every mobile screen hand-rolled its own container,
/// padding and header, which is why the app read as a set of unrelated screens
/// even after the colour tokens were unified. One card, one header, one metric
/// tile — the same three primitives the web client is built from.

/// The standard surface: hairline border, no shadow in Vault, one soft lift in
/// Ledger. Precise, not floating.
class KCard extends StatelessWidget {
  const KCard({super.key, required this.child, this.padding, this.onTap});

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final body = Padding(
      padding: padding ?? const EdgeInsets.all(KhazanaSpace.x5),
      child: child,
    );
    return DecoratedBox(
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(KhazanaRadius.card),
        border: Border.all(color: cs.outline),
        boxShadow: isDark
            ? null
            : [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: onTap == null
          ? body
          : Material(
              color: Colors.transparent,
              child: InkWell(
                borderRadius: BorderRadius.circular(KhazanaRadius.card),
                onTap: onTap,
                child: body,
              ),
            ),
    );
  }
}

/// A card with a title row, optional subtitle and a trailing affordance.
class KSectionCard extends StatelessWidget {
  const KSectionCard({
    super.key,
    required this.title,
    required this.child,
    this.subtitle,
    this.trailing,
    this.onTap,
  });

  final String title;
  final String? subtitle;
  final Widget child;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return KCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: onTap,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(KhazanaRadius.card)),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                  KhazanaSpace.x5, KhazanaSpace.x4, KhazanaSpace.x4, KhazanaSpace.x4),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: t.titleMedium),
                        if (subtitle != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(subtitle!,
                                style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                          ),
                      ],
                    ),
                  ),
                  ?trailing,
                  if (trailing == null && onTap != null)
                    Icon(Icons.chevron_right, size: 20, color: cs.onSurfaceVariant),
                ],
              ),
            ),
          ),
          Divider(height: 1, thickness: 1, color: cs.outline),
          Padding(
            padding: const EdgeInsets.all(KhazanaSpace.x5),
            child: child,
          ),
        ],
      ),
    );
  }
}

/// A headline figure with its label, icon and a footer line.
///
/// `value == null` renders an em-dash and "Not yet tracked", never a zero — the
/// same null-honesty rule the Gauge and the web `Kpi` enforce. "We have not
/// measured this" and "this is zero" are different claims.
class KMetricCard extends StatelessWidget {
  const KMetricCard({
    super.key,
    required this.label,
    required this.icon,
    this.value,
    this.footer,
    this.tone,
    this.valueColor,
    this.onTap,
  });

  final String label;
  final IconData icon;
  final String? value;
  final Widget? footer;
  final Color? tone;
  final Color? valueColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final accent = tone ?? cs.primary;
    final untracked = value == null;

    return KCard(
      onTap: onTap,
      padding: const EdgeInsets.all(KhazanaSpace.x4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.13),
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Icon(icon, size: 15, color: accent),
              ),
              const SizedBox(width: KhazanaSpace.x2),
              Expanded(
                child: Text(label,
                    style: t.bodySmall?.copyWith(
                        color: cs.onSurfaceVariant, fontWeight: FontWeight.w600),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ),
              if (onTap != null)
                Icon(Icons.chevron_right, size: 18, color: cs.onSurfaceVariant),
            ],
          ),
          const SizedBox(height: KhazanaSpace.x3),
          Text(
            untracked ? '—' : value!,
            style: t.headlineSmall?.copyWith(
              color: untracked ? cs.onSurfaceVariant : (valueColor ?? cs.onSurface),
              fontWeight: FontWeight.w700,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          DefaultTextStyle.merge(
            style: t.bodySmall!.copyWith(color: cs.onSurfaceVariant),
            child: untracked ? const Text('Not yet tracked') : (footer ?? const SizedBox.shrink()),
          ),
        ],
      ),
    );
  }
}

/// A signed change, coloured AND shaped by direction.
///
/// The arrow is not decoration: colour alone fails for a colourblind reader, so
/// the glyph carries the same information.
class KDelta extends StatelessWidget {
  const KDelta({super.key, required this.value, this.suffix = '%', this.digits = 2});

  final double? value;
  final String suffix;
  final int digits;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final t = Theme.of(context).textTheme;
    if (value == null) {
      return Text('—', style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant));
    }
    final v = value!;
    final up = v > 0, down = v < 0;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final good = isDark ? KhazanaColors.vaultSuccess : KhazanaColors.ledgerSuccess;
    final bad = isDark ? KhazanaColors.vaultDanger : KhazanaColors.ledgerDanger;
    final c = up ? good : down ? bad : cs.onSurfaceVariant;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.13),
        borderRadius: BorderRadius.circular(KhazanaRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(up ? Icons.arrow_upward : down ? Icons.arrow_downward : Icons.remove,
              size: 11, color: c),
          const SizedBox(width: 3),
          Text('${v.abs().toStringAsFixed(digits)}$suffix',
              style: t.labelSmall?.copyWith(color: c, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
