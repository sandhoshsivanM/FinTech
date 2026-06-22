import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/di/data_providers.dart';

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
      error: (e, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: Colors.red),
              const SizedBox(width: 8),
              Flexible(child: Text('Could not open the vault: $e')),
            ],
          ),
        ),
      ),
    );
  }
}
