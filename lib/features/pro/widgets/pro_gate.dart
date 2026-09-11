import 'dart:ui';

import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/entitlement/entitlement_providers.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../domain/entitlement/feature_gate.dart';
import '../../../domain/entitlement/pro_feature.dart';
import '../../../presentation/glass_card.dart';

/// Wraps a Pro screen's body: renders the real thing when unlocked, and the
/// real thing *blurred behind a card* when not.
///
/// Not a blank wall, and not a redirect. Two reasons:
///
///  * A redirect loses the user's context and breaks the back button — they
///    tapped "Tax Centre" and ended up somewhere else, which reads as a bug.
///  * Someone who can faintly see their own sector P&L through the glass
///    converts. Someone shown an empty room with a price on it does not. The
///    data is theirs and it is already on the device; blurring it is honest
///    about that, where hiding it entirely pretends there is nothing to see.
class ProGate extends ConsumerWidget {
  const ProGate({
    required this.feature,
    required this.child,
    this.title,
    this.blurb,
    super.key,
  });

  final ProFeature feature;
  final Widget child;

  /// Defaults to a generic line; pass something specific to the screen where
  /// you can ("See what your gains would cost you in tax").
  final String? title;
  final String? blurb;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final decision = ref.watch(gateProvider(feature));
    if (decision.allowed) return child;

    final usedAllowance = decision.reason == GateReason.allowanceUsed;

    return Stack(
      fit: StackFit.expand,
      children: [
        // Still built, still real. IgnorePointer so nothing behind the glass is
        // tappable; ExcludeSemantics so a screen reader is not read a wall of
        // figures the user cannot act on.
        ExcludeSemantics(
          child: IgnorePointer(
            child: ImageFiltered(
              imageFilter: ImageFilter.blur(sigmaX: 7, sigmaY: 7),
              child: Opacity(opacity: 0.45, child: child),
            ),
          ),
        ),
        Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: GlassCard(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.workspace_premium_outlined,
                        size: 30, color: context.colors.accent),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      title ?? 'Part of Khazana Pro',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      usedAllowance
                          // Materially different from "this is a Pro feature",
                          // and the difference matters: it WAS available a
                          // moment ago, and pretending otherwise reads as a
                          // bait-and-switch.
                          ? 'You have used the free import that comes with '
                              'every vault. Khazana Pro removes the limit.'
                          : blurb ??
                              'A one-time purchase unlocks this, and everything '
                              'else in Pro, forever.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        height: 1.45,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: () => context.go(Routes.pro),
                        child: const Text('See what Pro includes'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// A small lock chip for list rows and nav entries.
class ProBadge extends ConsumerWidget {
  const ProBadge({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(isProProvider)) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: context.colors.accent.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        'PRO',
        style: TextStyle(
          fontSize: 9.5,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.8,
          color: context.colors.accent,
        ),
      ),
    );
  }
}
