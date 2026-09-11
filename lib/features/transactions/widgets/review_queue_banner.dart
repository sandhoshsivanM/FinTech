import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_tokens.dart';
import '../../capture/providers/capture_providers.dart';

/// "N transactions to confirm", above the ledger.
///
/// Auto-captured SMS and notification drafts never touch a total until a human
/// confirms them, which is the right rule and also means an unreviewed queue is
/// invisible — the money is real, the app has seen it, and no screen shows it.
/// This banner is where that gap gets closed, and it is how the Capture Inbox
/// stays reachable from the tab bar.
///
/// Absent entirely when the queue is empty. There is deliberately no "0 to
/// review" state: a persistent empty banner is chrome, and chrome is what makes
/// a real alert easy to skip past.
class ReviewQueueBanner extends ConsumerWidget {
  const ReviewQueueBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(pendingCaptureListProvider).valueOrNull ?? const [];
    if (pending.isEmpty) return const SizedBox.shrink();

    final n = pending.length;
    final text = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Material(
        color: context.colors.budgetWarn.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadii.button),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadii.button),
          onTap: () => context.go(Routes.captureInbox),
          child: Padding(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md, vertical: AppSpacing.sm),
            child: Row(
              children: [
                Icon(Icons.auto_awesome_motion_outlined,
                    size: 18, color: context.colors.budgetWarn),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    '$n captured transaction${n == 1 ? '' : 's'} to confirm',
                    style: text.labelLarge?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: context.colors.budgetWarn,
                    ),
                  ),
                ),
                Text('Review',
                    style: text.labelMedium?.copyWith(
                        color: context.colors.budgetWarn,
                        fontWeight: FontWeight.w700)),
                Icon(Icons.chevron_right_rounded,
                    size: 18, color: context.colors.budgetWarn),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
