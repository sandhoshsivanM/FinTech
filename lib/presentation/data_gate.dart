import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/di/data_providers.dart';
import '../core/theme/app_tokens.dart';
import '../data/database/encrypted_executor.dart' show VaultKeyMismatchException;

/// Gates feature content on the encrypted database being open. Downstream
/// providers may safely use `requireValue` once this shows [child].
class DataGate extends ConsumerWidget {
  const DataGate({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final db = ref.watch(appDatabaseProvider);
    return db.when(
      data: (_) => child,
      loading: () => const Center(
        child: CircularProgressIndicator(semanticsLabel: 'Opening vault'),
      ),
      error: (e, _) => _OpenFailure(error: e),
    );
  }
}

class _OpenFailure extends StatelessWidget {
  const _OpenFailure({required this.error});
  final Object error;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;

    // A key mismatch is not corruption, and saying so matters: the raw SQLite
    // text is "file is not a database", which reads as "your data is
    // destroyed" when the file is in fact perfectly intact.
    final mismatch = error is VaultKeyMismatchException;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(mismatch ? Icons.key_off_outlined : Icons.error_outline,
                  size: 40, color: scheme.error),
              const SizedBox(height: AppSpacing.md),
              Text(
                mismatch
                    ? 'This vault belongs to a different PIN'
                    : 'Could not open the vault',
                textAlign: TextAlign.center,
                style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                mismatch
                    ? 'An encrypted database is already stored on this device, '
                        'but the current PIN does not decrypt it. Nothing has '
                        'been changed or deleted.\n\n'
                        'Unlock with the original PIN to reach it, or restore '
                        'from a backup in Settings.'
                    : '$error',
                textAlign: TextAlign.center,
                style: text.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
