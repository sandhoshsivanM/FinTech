import 'package:flutter/material.dart';

import '../core/theme/app_tokens.dart';

/// The app's one empty state: tinted icon, what this is, and what to do next.
///
/// Extracted from the capture inbox, which was the only screen that had a real
/// one. Everywhere else settled for a bare centred sentence — "No recurring
/// rules yet.", "No policies yet. Tap Add." — floating in an otherwise blank
/// window, which reads as a screen that failed to load rather than one with
/// nothing in it yet.
///
/// [action] is optional but strongly preferred: an empty screen whose whole
/// point is "add the first one" should carry the button that does it, rather
/// than making the user hunt for a FAB in the corner.
class EmptyState extends StatelessWidget {
  const EmptyState({
    required this.icon,
    required this.title,
    required this.message,
    this.action,
    super.key,
  });

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: ConstrainedBox(
          // Prose is unreadable in one long line; this is roughly the 60-75
          // characters that keeps the eye from losing its place.
          constraints: const BoxConstraints(maxWidth: 420),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: AppColors.accent.withValues(alpha: 0.10),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 34, color: AppColors.accent),
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 16),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                message,
                textAlign: TextAlign.center,
                style: TextStyle(color: muted, height: 1.4),
              ),
              if (action != null) ...[
                const SizedBox(height: AppSpacing.lg),
                action!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}
