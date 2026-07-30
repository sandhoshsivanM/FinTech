import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/category.dart';
import '../../../domain/entities/pending_capture.dart';
import '../../../domain/entities/transaction.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/glass_card.dart';
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
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text('Auto-capture'),
      ),
      body: const SafeArea(child: DataGate(child: _Body())),
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
          const _EmptyState()
        else
          for (final c in captures) ...[
            _CaptureCard(capture: c, categories: categories),
            const SizedBox(height: AppSpacing.md),
          ],
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();
  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
      child: Column(
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: AppColors.accent.withValues(alpha: 0.10),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.auto_awesome_motion_outlined,
                size: 34, color: AppColors.accent),
          ),
          const SizedBox(height: AppSpacing.md),
          const Text('Nothing to review',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: AppSpacing.xs),
          Text(
            'Incoming bank SMS and notifications are parsed on-device and appear '
            'here as ready-to-add transactions.',
            textAlign: TextAlign.center,
            style: TextStyle(color: muted, height: 1.4),
          ),
        ],
      ),
    );
  }
}

class _PermissionCard extends ConsumerWidget {
  const _PermissionCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final channel = ref.watch(captureChannelProvider);
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.verified_user_outlined,
                  size: 18, color: AppColors.accent),
              const SizedBox(width: AppSpacing.sm),
              const Text('Capture access',
                  style: TextStyle(fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Grant notification access and SMS permission so bank alerts are '
            'parsed on-device. The raw text is discarded immediately — only the '
            'amount, merchant and date are kept.',
            style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                height: 1.4),
          ),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              OutlinedButton.icon(
                onPressed: channel.openNotificationAccessSettings,
                icon: const Icon(Icons.notifications_active_outlined, size: 18),
                label: const Text('Notification access'),
              ),
              OutlinedButton.icon(
                onPressed: channel.requestSmsPermission,
                icon: const Icon(Icons.sms_outlined, size: 18),
                label: const Text('Allow SMS'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _UnsupportedCard extends StatelessWidget {
  const _UnsupportedCard();
  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Row(
        children: [
          const Icon(Icons.info_outline, color: AppColors.accent),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              'Automatic SMS / notification capture is available on Android only. '
              'You can still add transactions manually.',
              style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  height: 1.4),
            ),
          ),
        ],
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
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final selected = _categoryId ??
        (widget.categories.isNotEmpty ? widget.categories.first.id : null);

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: AppColors.accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  c.source == CaptureSource.sms
                      ? Icons.sms_outlined
                      : Icons.notifications_outlined,
                  size: 17,
                  color: AppColors.accent,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(c.merchant ?? 'Unknown merchant',
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text('${df.format(c.occurredAt)} · ${isIncome ? 'Income' : 'Expense'}',
                        style: TextStyle(fontSize: 12, color: muted)),
                  ],
                ),
              ),
              Text(
                Money.formatSigned(c.amount, isIncome: isIncome),
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                  color: isIncome ? AppColors.income : AppColors.expense,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          DropdownButtonFormField<String>(
            initialValue: selected,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Category',
              isDense: true,
              prefixIcon: Icon(Icons.label_outline, size: 18),
            ),
            items: [
              for (final cat in widget.categories)
                DropdownMenuItem(value: cat.id, child: Text(cat.name)),
            ],
            onChanged: (v) => setState(() => _categoryId = v),
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                onPressed: () => ref.read(captureActionsProvider).dismiss(c),
                child: const Text('Dismiss'),
              ),
              const SizedBox(width: AppSpacing.sm),
              FilledButton.icon(
                icon: const Icon(Icons.check, size: 18),
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
                label: const Text('Add'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
