import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/category.dart';
import '../../../domain/entities/pending_capture.dart';
import '../../../domain/entities/transaction.dart';
import '../../../presentation/data_gate.dart';
import '../../transactions/providers/category_providers.dart';
import '../providers/capture_providers.dart';

/// Review queue for auto-captured SMS / notification transaction drafts. Each
/// draft is confirmed into a balanced double-entry transaction or dismissed —
/// nothing is auto-committed (PRD §13).
class CaptureInboxScreen extends StatelessWidget {
  const CaptureInboxScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Auto-capture')),
      body: const DataGate(child: _Body()),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final supported = ref.watch(captureSupportedProvider);
    final captures = ref.watch(pendingCaptureListProvider).valueOrNull ?? const [];
    final categories = ref.watch(categoryListProvider).valueOrNull ?? const [];

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.md),
      children: [
        if (supported) const _PermissionCard() else const _UnsupportedCard(),
        const SizedBox(height: AppSpacing.md),
        if (captures.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
            child: Center(
              child: Text(
                'No drafts to review.\nIncoming bank SMS and notifications appear here.',
                textAlign: TextAlign.center,
              ),
            ),
          )
        else
          for (final c in captures)
            _CaptureCard(capture: c, categories: categories),
      ],
    );
  }
}

class _PermissionCard extends ConsumerWidget {
  const _PermissionCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final channel = ref.watch(captureChannelProvider);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Capture access',
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: AppSpacing.xs),
            const Text(
              'Grant notification access and SMS permission so bank alerts are '
              'parsed on-device. Raw text is discarded immediately — only the '
              'amount, merchant and date are kept.',
            ),
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              children: [
                OutlinedButton.icon(
                  onPressed: channel.openNotificationAccessSettings,
                  icon: const Icon(Icons.notifications_active_outlined),
                  label: const Text('Notification access'),
                ),
                OutlinedButton.icon(
                  onPressed: channel.requestSmsPermission,
                  icon: const Icon(Icons.sms_outlined),
                  label: const Text('Allow SMS'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _UnsupportedCard extends StatelessWidget {
  const _UnsupportedCard();
  @override
  Widget build(BuildContext context) {
    return const Card(
      child: Padding(
        padding: EdgeInsets.all(AppSpacing.md),
        child: Text(
          'Automatic SMS / notification capture is available on Android only. '
          'You can still paste a bank message to create a transaction.',
        ),
      ),
    );
  }
}

class _CaptureCard extends ConsumerStatefulWidget {
  const _CaptureCard({required this.capture, required this.categories});
  final PendingCapture capture;
  final List<Category> categories;

  @override
  ConsumerState<_CaptureCard> createState() => _CaptureCardState();
}

class _CaptureCardState extends ConsumerState<_CaptureCard> {
  String? _categoryId;

  @override
  Widget build(BuildContext context) {
    final c = widget.capture;
    final isIncome = c.type == TxnType.income;
    final df = DateFormat('d MMM yyyy');
    final selected = _categoryId ??
        (widget.categories.isNotEmpty ? widget.categories.first.id : null);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  c.source == CaptureSource.sms
                      ? Icons.sms_outlined
                      : Icons.notifications_outlined,
                  size: 18,
                  color: AppColors.accent,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    c.merchant ?? 'Unknown merchant',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                Text(
                  Money.formatSigned(c.amount, isIncome: isIncome),
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: isIncome ? AppColors.income : AppColors.expense,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            Text('${df.format(c.occurredAt)} · ${isIncome ? 'Income' : 'Expense'}',
                style: TextStyle(color: AppColors.darkOnSurfaceMuted)),
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: selected,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Category',
                      isDense: true,
                    ),
                    items: [
                      for (final cat in widget.categories)
                        DropdownMenuItem(value: cat.id, child: Text(cat.name)),
                    ],
                    onChanged: (v) => setState(() => _categoryId = v),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () =>
                      ref.read(captureActionsProvider).dismiss(c),
                  child: const Text('Dismiss'),
                ),
                const SizedBox(width: AppSpacing.sm),
                FilledButton(
                  onPressed: selected == null
                      ? null
                      : () {
                          final cat = widget.categories
                              .firstWhere((x) => x.id == selected);
                          ref.read(captureActionsProvider).confirm(
                                c,
                                categoryId: cat.id,
                                categoryName: cat.name,
                              );
                        },
                  child: const Text('Add'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
