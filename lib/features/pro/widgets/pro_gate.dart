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

/// Wraps a Pro screen's body: renders the real thing when unlocked, and when
/// not, the real layout faded and non-interactive with one clean lock card
/// below the header.
///
/// Not a blank wall, and not a redirect: a redirect loses the user's context
/// and breaks the back button, and someone who can see the shape of their own
/// screen converts better than someone shown an empty room with a price on it.
/// No blur: a blurred wall of text under a card looked broken. The preview is
/// simply quieter (opacity .55) and fades out behind the card, so nothing
/// overlaps readable text.
class ProGate extends ConsumerWidget {
  const ProGate({
    required this.feature,
    required this.child,
    this.title,
    this.blurb,
    this.benefits = const [],
    super.key,
  });

  final ProFeature feature;
  final Widget child;

  /// The screen's name, shown as "<title> is part of Pro". Defaults to a
  /// generic line.
  final String? title;

  /// The small muted line under the button.
  final String? blurb;

  /// Two or three things Pro adds on this screen.
  final List<String> benefits;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final decision = ref.watch(gateProvider(feature));
    if (decision.allowed) return child;

    final usedAllowance = decision.reason == GateReason.allowanceUsed;
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final canvas = dark ? AppColors.darkCanvas : AppColors.lightCanvas;
    final text = Theme.of(context).textTheme;
    final bullets = benefits.isNotEmpty
        ? benefits
        : const [
            'Everything in Pro, for one payment',
            'No subscription, no account',
            'Your data stays on this device',
          ];

    return Stack(
      fit: StackFit.expand,
      children: [
        // Still built, still real. IgnorePointer so nothing behind is tappable;
        // ExcludeSemantics so a screen reader is not read a wall of figures the
        // user cannot act on.
        ExcludeSemantics(
          child: IgnorePointer(child: Opacity(opacity: 0.55, child: child)),
        ),
        // The preview fades out towards the card.
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          height: 420,
          child: IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [canvas.withValues(alpha: 0), canvas],
                  stops: const [0, 0.55],
                ),
              ),
            ),
          ),
        ),
        Align(
          alignment: Alignment.bottomCenter,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.lg,
              AppSpacing.lg,
              100,
            ),
            reverse: true,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: GlassCard(
                padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        color: scheme.primary,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(
                        Icons.lock_outline_rounded,
                        size: 20,
                        color: scheme.onPrimary,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Text(
                      title == null
                          ? 'Part of Khazana Pro'
                          : '$title is part of Pro',
                      textAlign: TextAlign.center,
                      style: text.titleLarge,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    for (final b in bullets)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Padding(
                              padding: const EdgeInsets.only(top: 8, right: 10),
                              child: Container(
                                width: 5,
                                height: 5,
                                decoration: BoxDecoration(
                                  color: scheme.onSurfaceVariant,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ),
                            Expanded(
                              child: Text(
                                b,
                                style: text.bodyMedium?.copyWith(
                                  color: scheme.onSurfaceVariant,
                                  height: 1.4,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    const SizedBox(height: AppSpacing.md),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          shape: const StadiumBorder(),
                          elevation: 0,
                        ),
                        onPressed: () => context.go(Routes.pro),
                        child: const Text('See what Pro includes'),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      usedAllowance
                          // It WAS available a moment ago; pretending otherwise
                          // reads as a bait-and-switch.
                          ? 'You have used the free import that comes with '
                                'every vault.'
                          : blurb ?? 'One payment, yours forever.',
                      textAlign: TextAlign.center,
                      style: text.bodySmall?.copyWith(
                        color: scheme.onSurfaceVariant,
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
        'Pro',
        style: TextStyle(
          fontSize: 10.5,
          fontWeight: FontWeight.w600,
          color: context.colors.accent,
        ),
      ),
    );
  }
}
