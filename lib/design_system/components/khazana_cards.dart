import 'package:flutter/material.dart';

import '../../core/help/info_hint.dart';

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
            : [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.04),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
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
    this.help,
  });

  /// Help key (see SectionHelp) for an inline info hint after the title.
  final String? help;
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
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(KhazanaRadius.card),
            ),
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                KhazanaSpace.x5,
                help == null ? KhazanaSpace.x4 : 6,
                KhazanaSpace.x4,
                help == null ? KhazanaSpace.x4 : 6,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (help == null)
                          Text(title, style: t.titleMedium)
                        else
                          InfoHint.titled(
                            Text(title, style: t.titleMedium),
                            help!,
                          ),
                        if (subtitle != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              subtitle!,
                              style: t.bodySmall?.copyWith(
                                color: cs.onSurfaceVariant,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  ?trailing,
                  if (trailing == null && onTap != null)
                    Icon(
                      Icons.chevron_right,
                      size: 20,
                      color: cs.onSurfaceVariant,
                    ),
                ],
              ),
            ),
          ),
          Divider(height: 1, thickness: 1, color: cs.outline),
          Padding(padding: const EdgeInsets.all(KhazanaSpace.x5), child: child),
        ],
      ),
    );
  }
}
