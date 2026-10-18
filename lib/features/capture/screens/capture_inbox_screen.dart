import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/help/info_hint.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/account.dart';
import '../../../domain/entities/category.dart';
import '../../../domain/entities/pending_capture.dart';
import '../../../domain/entities/transaction.dart';
import '../../../domain/services/notification_parser.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/glass_card.dart';
import '../../accounts/providers/account_providers.dart';
import '../../transactions/providers/category_providers.dart';
import '../providers/capture_providers.dart';
import '../providers/capture_settings.dart';
import '../widgets/notification_access_disclosure.dart';
import '../widgets/sms_access_disclosure.dart';

/// Auto-capture: the captures waiting for a decision, and the ones decided in
/// the last week. Confident captures are added automatically (and listed under
/// "Recently added" with an Undo); doubtful ones wait here, never touching a
/// balance until the user approves, corrects or rejects them.
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
        title: InfoHint.titled(const Text('Auto-capture'), 'capture.inbox'),
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
    final pending = ref.watch(pendingCaptureListProvider).valueOrNull ?? const [];
    final decided =
        ref.watch(recentlyDecidedCaptureProvider).valueOrNull ?? const [];
    final categories = ref.watch(categoryListProvider).valueOrNull ?? const [];
    // Bank accounts and cards only: cash is the "default" option already, and
    // investment or manual-asset accounts are never what a payment alert moves.
    final accounts = (ref.watch(accountListProvider).valueOrNull ?? const <Account>[])
        .where((a) => !a.archived && (a.subtype == 'bank' || a.subtype == 'credit_card'))
        .toList();

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        if (supported) const _PermissionCard() else const _UnsupportedCard(),
        const SizedBox(height: AppSpacing.md),
        const _AutoPostCard(),
        const SizedBox(height: AppSpacing.lg),
        _SectionHeader(
          title: 'To review',
          count: pending.length,
          help: 'These never change a balance until you approve them.',
        ),
        if (pending.isEmpty)
          const _EmptyState()
        else
          for (final c in pending) ...[
            _ReviewCard(
              key: ValueKey(c.id),
              capture: c,
              categories: categories,
              accounts: accounts,
            ),
            const SizedBox(height: AppSpacing.md),
          ],
        if (decided.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          _SectionHeader(
            title: 'Recently added',
            count: decided.length,
            help: 'The last ${recentlyDecidedWindow.inDays} days. Undo puts an entry back in review.',
          ),
          GlassCard(
            child: Column(
              children: [
                for (final c in decided) _DecidedTile(capture: c),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.count, required this.help});
  final String title;
  final int count;
  final String help;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$title · $count',
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
          const SizedBox(height: 2),
          Text(help, style: TextStyle(fontSize: 12, color: muted)),
        ],
      ),
    );
  }
}

class _AutoPostCard extends ConsumerWidget {
  const _AutoPostCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final autoPost = ref.watch(captureAutoPostProvider);
    return GlassCard(
      child: SwitchListTile.adaptive(
        contentPadding: EdgeInsets.zero,
        value: autoPost,
        onChanged: (v) => ref.read(captureAutoPostProvider.notifier).set(v),
        title: const Text('Add confident captures automatically',
            style: TextStyle(fontWeight: FontWeight.w500)),
        subtitle: Text(
          autoPost
              ? 'Known bank, linked account and a learned category: added for you, '
                  'with Undo. Anything doubtful waits here.'
              : 'Every capture waits here for you to approve.',
          style: TextStyle(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
            height: 1.4,
          ),
        ),
      ),
    );
  }
}

/// One capture awaiting a decision: why it is here, what was read, and the
/// three answers — approve as read, correct and approve, or reject.
class _ReviewCard extends ConsumerStatefulWidget {
  const _ReviewCard({
    super.key,
    required this.capture,
    required this.categories,
    required this.accounts,
  });
  final PendingCapture capture;
  final List<Category> categories;
  final List<Account> accounts;

  @override
  ConsumerState<_ReviewCard> createState() => _ReviewCardState();
}

class _ReviewCardState extends ConsumerState<_ReviewCard> {
  String? _categoryId;
  String? _accountId;
  late TxnType _type;
  late final TextEditingController _amount;
  bool _rememberAccount = true;
  bool _busy = false;

  PendingCapture get c => widget.capture;

  @override
  void initState() {
    super.initState();
    _type = c.type;
    _amount = TextEditingController(text: c.effectiveAmount.toString());
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Decimal? get _parsedAmount {
    final v = Decimal.tryParse(_amount.text.replaceAll(',', '').trim());
    return (v == null || v <= Decimal.zero) ? null : v;
  }

  bool get _edited => _parsedAmount != c.amount || _type != c.type;

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final df = DateFormat('d MMM yyyy');
    final isIncome = _type == TxnType.income;
    final categoryId = _categoryId ??
        (widget.categories.any((x) => x.id == c.categoryId)
            ? c.categoryId
            : (widget.categories.isNotEmpty ? widget.categories.first.id : null));
    final accountId = _accountId ??
        (widget.accounts.any((a) => a.id == c.accountId) ? c.accountId : null);
    final amount = _parsedAmount;
    final bank = defaultBankProfiles.where((p) => p.id == c.profileId).firstOrNull;

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
                  color: context.colors.accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  c.source == CaptureSource.sms
                      ? Icons.sms_outlined
                      : Icons.notifications_outlined,
                  size: 17,
                  color: context.colors.accent,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(c.merchant ?? 'Unknown merchant',
                        style: const TextStyle(fontWeight: FontWeight.w500)),
                    Text(
                      [
                        df.format(c.occurredAt),
                        if (bank != null) bank.name,
                        if (c.accountLast4 != null) '••${c.accountLast4}',
                      ].join(' · '),
                      style: TextStyle(fontSize: 12, color: muted),
                    ),
                  ],
                ),
              ),
              Text(
                Money.formatSigned(amount ?? c.amount, isIncome: isIncome),
                style: TextStyle(
                  fontWeight: FontWeight.w500,
                  fontSize: 16,
                  color: isIncome ? context.colors.income : context.colors.expense,
                ),
              ),
            ],
          ),
          if (c.reasons.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            for (final r in c.reasons)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline, size: 14, color: muted),
                    const SizedBox(width: AppSpacing.xs),
                    Expanded(
                      child: Text(r.label,
                          style: TextStyle(fontSize: 12, color: muted, height: 1.3)),
                    ),
                  ],
                ),
              ),
          ],
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _amount,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                  decoration: InputDecoration(
                    labelText: 'Amount',
                    isDense: true,
                    prefixText: '₹ ',
                    errorText: amount == null ? 'Enter an amount' : null,
                    helperText: amount != null && amount != c.amount
                        ? 'Read as ${Money.format(c.amount)}'
                        : null,
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              SegmentedButton<TxnType>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: TxnType.expense, label: Text('Out')),
                  ButtonSegment(value: TxnType.income, label: Text('In')),
                ],
                selected: {_type},
                onSelectionChanged: (s) => setState(() => _type = s.first),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          DropdownButtonFormField<String>(
            initialValue: categoryId,
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
          DropdownButtonFormField<String?>(
            initialValue: accountId,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Account',
              isDense: true,
              prefixIcon: Icon(Icons.account_balance_outlined, size: 18),
            ),
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text('Cash (default)')),
              for (final a in widget.accounts)
                DropdownMenuItem<String?>(value: a.id, child: Text(a.name)),
            ],
            onChanged: (v) => setState(() => _accountId = v),
          ),
          if (c.accountLast4 != null && accountId != null && accountId != c.accountId)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              controlAffinity: ListTileControlAffinity.leading,
              value: _rememberAccount,
              onChanged: (v) => setState(() => _rememberAccount = v ?? true),
              title: Text('Remember ••${c.accountLast4} as this account'),
            ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                onPressed: _busy
                    ? null
                    : () => _run(() => ref.read(captureReviewProvider).reject(c)),
                child: const Text('Reject'),
              ),
              const SizedBox(width: AppSpacing.sm),
              FilledButton.icon(
                icon: const Icon(Icons.check, size: 18),
                onPressed: (_busy || categoryId == null || amount == null)
                    ? null
                    : () => _run(() => ref.read(captureReviewProvider).approve(
                          c,
                          categoryId: categoryId,
                          accountId: accountId,
                          amount: amount,
                          type: _type,
                          rememberAccount: _rememberAccount,
                        )),
                label: Text(_edited ? 'Save & approve' : 'Approve'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DecidedTile extends ConsumerWidget {
  const _DecidedTile({required this.capture});
  final PendingCapture capture;

  static String _statusLabel(CaptureStatus s) => switch (s) {
        CaptureStatus.autoPosted => 'Added automatically',
        CaptureStatus.approved => 'Approved',
        CaptureStatus.editedApproved => 'Corrected & approved',
        CaptureStatus.rejected => 'Rejected',
        CaptureStatus.reversed => 'Undone',
        CaptureStatus.pending => 'Waiting',
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = capture;
    final isIncome = c.type == TxnType.income;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      dense: true,
      title: Text(c.merchant ?? 'Unknown merchant'),
      subtitle: Text(
        '${DateFormat('d MMM').format(c.occurredAt)} · ${_statusLabel(c.status)}',
        style: TextStyle(fontSize: 12, color: muted),
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            Money.formatSigned(c.effectiveAmount, isIncome: isIncome),
            style: TextStyle(
              color: c.status == CaptureStatus.rejected
                  ? muted
                  : (isIncome ? context.colors.income : context.colors.expense),
              decoration:
                  c.status == CaptureStatus.rejected ? TextDecoration.lineThrough : null,
            ),
          ),
          TextButton(
            onPressed: () => ref.read(captureReviewProvider).undo(c),
            child: Text(c.status == CaptureStatus.rejected ? 'Restore' : 'Undo'),
          ),
        ],
      ),
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
              color: context.colors.accent.withValues(alpha: 0.10),
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.auto_awesome_motion_outlined,
              size: 34,
              color: context.colors.accent,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          const Text(
            'Nothing to review',
            style: TextStyle(fontWeight: FontWeight.w500, fontSize: 16),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            'Bank payment alerts are read on this device. Confident ones are '
            'added for you; anything doubtful waits here.',
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
              Icon(
                Icons.verified_user_outlined,
                size: 18,
                color: context.colors.accent,
              ),
              const SizedBox(width: AppSpacing.sm),
              const Text(
                'Capture access',
                style: TextStyle(fontWeight: FontWeight.w500),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Optional. With your permission, Khazana reads bank and UPI payment '
            'alerts on this device. The raw text is discarded immediately and '
            'nothing is uploaded — only the amount, merchant, date and the last '
            'digits of the account are kept.',
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              height: 1.4,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          const _SmsControls(),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              OutlinedButton.icon(
                onPressed: () async {
                  // Play's prominent-disclosure rule: explain, get an explicit
                  // yes, and only then open the system settings screen.
                  final agreed = await showNotificationAccessDisclosure(context);
                  if (agreed) await channel.openNotificationAccessSettings();
                },
                icon: const Icon(Icons.notifications_active_outlined, size: 18),
                label: const Text('Notification access'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// SMS access and history import — shown only on the sideload build, which is
/// the only one that can read SMS.
class _SmsControls extends ConsumerStatefulWidget {
  const _SmsControls();

  @override
  ConsumerState<_SmsControls> createState() => _SmsControlsState();
}

class _SmsControlsState extends ConsumerState<_SmsControls> {
  bool _importing = false;

  Future<void> _allow() async {
    final agreed = await showSmsAccessDisclosure(context);
    if (!agreed) return;
    await ref.read(captureChannelProvider).requestSmsPermission();
    ref.invalidate(smsPermissionProvider);
  }

  Future<void> _import() async {
    setState(() => _importing = true);
    try {
      final result = await ref.read(smsCatchUpProvider).importHistory();
      ref.read(lastSmsCatchUpProvider.notifier).state = result;
    } finally {
      if (mounted) setState(() => _importing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final available = ref.watch(smsAvailableProvider).valueOrNull ?? false;
    if (!available) return const SizedBox.shrink();
    final granted = ref.watch(smsPermissionProvider).valueOrNull ?? false;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(granted ? Icons.check_circle_outline : Icons.sms_outlined,
                  size: 16, color: granted ? context.colors.income : muted),
              const SizedBox(width: AppSpacing.xs),
              Text(granted ? 'Bank SMS: on' : 'Bank SMS: off',
                  style: const TextStyle(fontWeight: FontWeight.w500)),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              if (!granted)
                FilledButton.icon(
                  onPressed: _allow,
                  icon: const Icon(Icons.sms_outlined, size: 18),
                  label: const Text('Allow bank SMS'),
                )
              else
                OutlinedButton.icon(
                  onPressed: _importing ? null : _import,
                  icon: _importing
                      ? const SizedBox(
                          width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.history, size: 18),
                  label: Text(_importing ? 'Importing…' : 'Import last 90 days'),
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
          Icon(Icons.info_outline, color: context.colors.accent),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              'Automatic capture reads bank alerts on Android only. You can '
              'still add transactions manually.',
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
