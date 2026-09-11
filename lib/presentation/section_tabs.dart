import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/router/nav_sections.dart';
import '../core/theme/app_tokens.dart';
import '../core/theme/semantic_colors.dart';

/// The segmented strip that moves between a section's sibling screens.
///
/// This is what replaced the "More" list. Budget is not somewhere else in the
/// app; it is one tap sideways from Activity, under Money, where it belongs.
/// Siblings sit next to each other because that is how people think about
/// them — not because a menu happened to list them adjacently.
///
/// Horizontally scrollable rather than five equal segments: "Recurring" and
/// "Accounts" cannot both fit a fifth of a 390pt screen without truncating, and
/// a truncated nav label is worse than one that needs a nudge to reach.
class SectionTabs extends StatelessWidget {
  const SectionTabs({required this.section, super.key});

  final NavSection section;

  @override
  Widget build(BuildContext context) {
    if (section.children.isEmpty) return const SizedBox.shrink();

    final here = GoRouterState.of(context).matchedLocation;
    final scheme = Theme.of(context).colorScheme;

    return SizedBox(
      height: 38,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
        itemCount: section.children.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
        itemBuilder: (context, i) {
          final child = section.children[i];
          // Longest match, so `/app/investments/breakdown` selects Holdings
          // rather than Portfolio, whose route is a prefix of it.
          final selected = _isSelected(here, child.route, section);
          return _Segment(
            label: child.label,
            selected: selected,
            onTap: () => context.go(child.route),
            scheme: scheme,
          );
        },
      ),
    );
  }

  static bool _isSelected(String here, String route, NavSection section) {
    // Exact wins outright.
    if (here == route) return true;
    // Otherwise the longest sibling that prefixes the location owns it, so a
    // sub-page keeps its parent segment lit.
    final owner = section.children
        .map((c) => c.route)
        .where((r) => here.startsWith('$r/'))
        .fold<String?>(null, (best, r) => best == null || r.length > best.length ? r : best);
    return owner == route;
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.label,
    required this.selected,
    required this.onTap,
    required this.scheme,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? context.colors.accent : scheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(AppRadii.pill),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadii.pill),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                letterSpacing: -0.1,
                // Near-black on emerald, not white: the accent is light enough
                // that white text on it reads about 2.4:1.
                color: selected
                    ? scheme.onPrimary
                    : scheme.onSurfaceVariant,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
