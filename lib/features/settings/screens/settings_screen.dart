import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';
import 'package:uuid/uuid.dart';

import '../../../core/di/data_providers.dart';
import '../../../core/di/providers.dart';
import '../../../core/router/app_router.dart';
import '../../../core/security/vault_registry.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../presentation/data_gate.dart';
import '../providers/sample_data_provider.dart';
import '../providers/settings_providers.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: const DataGate(child: _SettingsBody()),
    );
  }
}

class _SettingsBody extends ConsumerWidget {
  const _SettingsBody();

  Future<void> _run(
    BuildContext context,
    Future<String> Function() action, {
    required String shareText,
  }) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final path = await action();
      // Hand the file to the OS share sheet (PRD §5B: user shares explicitly).
      await Share.shareXFiles([XFile(path)], text: shareText);
    } on Exception catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Failed: $e')));
    }
  }

  Future<void> _loadSampleData(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Load sample data?'),
        content: const Text(
          'This adds demo transactions, holdings, liabilities, budgets, goals '
          'and bills to the current vault so you can explore the app. You can '
          'delete items individually afterwards.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Load')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    // The spinner dialog is pushed on the ROOT navigator (showDialog default),
    // so it must be popped from the root navigator — popping the nearest
    // (shell) navigator would pop the Settings page and crash go_router.
    final rootNav = Navigator.of(context, rootNavigator: true);
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );
    try {
      await ref.read(sampleDataProvider).load();
      if (rootNav.canPop()) rootNav.pop(); // close spinner
      messenger.showSnackBar(
          const SnackBar(content: Text('Sample data loaded.')));
      if (context.mounted) context.go(Routes.dashboard);
    } catch (e) {
      if (rootNav.canPop()) rootNav.pop();
      messenger.showSnackBar(SnackBar(content: Text('Failed: $e')));
    }
  }

  Future<void> _eraseAllData(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Erase all data?'),
        content: const Text(
          'This permanently deletes all transactions, holdings, liabilities, '
          'goals, budgets, recurring rules, insurance and snapshots in this '
          'vault. Your categories and the vault itself are kept. This cannot '
          'be undone.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.expense),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Erase everything'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(settingsActionsProvider).eraseAllData();
      messenger.showSnackBar(
          const SnackBar(content: Text('All data erased.')));
      if (context.mounted) context.go(Routes.dashboard);
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Failed: $e')));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final vaultId = ref.watch(currentVaultIdProvider);
    final actions = ref.watch(settingsActionsProvider);

    return ListView(
      children: [
        const _SectionHeader('Vault'),
        ListTile(
          leading: const Icon(Icons.account_balance_wallet_outlined),
          title: const Text('Active vault'),
          subtitle: Text(vaultId),
        ),
        ListTile(
          leading: const Icon(Icons.lock_outline),
          title: const Text('Lock now'),
          onTap: () => ref.read(vaultUnlockProvider.notifier).lock(),
        ),
        ListTile(
          leading: const Icon(Icons.swap_horiz),
          title: const Text('Switch / add vault'),
          subtitle: const Text('Re-authentication required'),
          onTap: () => _showVaultSwitcher(context, ref),
        ),
        const Divider(),
        const _SectionHeader('Demo'),
        ListTile(
          leading: const Icon(Icons.auto_awesome),
          title: const Text('Load sample data'),
          subtitle: const Text('Fill this vault with realistic demo data'),
          onTap: () => _loadSampleData(context, ref),
        ),
        const Divider(),
        const _SectionHeader('Import'),
        ListTile(
          leading: const Icon(Icons.account_balance),
          title: const Text('Import bank statement'),
          subtitle: const Text('HDFC / ICICI / SBI / Axis'),
          onTap: () => context.go(Routes.bankImport),
        ),
        ListTile(
          leading: const Icon(Icons.show_chart),
          title: const Text('Market data'),
          subtitle: const Text('API keys for live prices'),
          onTap: () => context.go(Routes.marketData),
        ),
        ListTile(
          leading: const Icon(Icons.currency_exchange),
          title: const Text('Currency'),
          subtitle: const Text('Exchange rates'),
          onTap: () => context.go(Routes.currency),
        ),
        const Divider(),
        const _SectionHeader('Backup'),
        ListTile(
          leading: const Icon(Icons.save_alt),
          title: const Text('Export encrypted backup'),
          subtitle: const Text('AES-256-GCM, verified on restore'),
          onTap: () => _run(context, actions.exportBackup,
              shareText: 'Khazana encrypted backup'),
        ),
        const Divider(),
        const _SectionHeader('Data & Privacy'),
        ListTile(
          leading: const Icon(Icons.bug_report_outlined),
          title: const Text('Export error log'),
          subtitle: const Text('Plaintext logs.json — no financial data'),
          onTap: () => _showLogDisclaimer(context, ref),
        ),
        const Divider(),
        const _SectionHeader('Danger zone'),
        ListTile(
          leading: const Icon(Icons.delete_forever_outlined,
              color: AppColors.expense),
          title: const Text('Erase all data'),
          subtitle: const Text(
              'Permanently delete all financial data in this vault'),
          onTap: () => _eraseAllData(context, ref),
        ),
        const Padding(
          padding: EdgeInsets.all(AppSpacing.md),
          child: Text(
            'Khazana is fully offline. Nothing leaves this device without '
            'your explicit action.',
            style: TextStyle(fontStyle: FontStyle.italic),
          ),
        ),
      ],
    );
  }

  Future<void> _showVaultSwitcher(BuildContext context, WidgetRef ref) async {
    final vaults = await ref.read(vaultListProvider.future);
    if (!context.mounted) return;
    final current = ref.read(currentVaultIdProvider);
    await showModalBottomSheet<void>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(AppSpacing.md),
              child: Text('Vaults', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
            for (final v in vaults)
              ListTile(
                leading: Icon(v.id == current
                    ? Icons.check_circle
                    : Icons.account_balance_wallet_outlined),
                title: Text(v.name),
                enabled: v.id != current,
                onTap: () {
                  // Switching re-points the unlock gate → forces re-auth.
                  ref.read(selectedVaultProvider.notifier).state = v;
                  ref.read(vaultUnlockProvider.notifier).lock();
                  Navigator.pop(context);
                },
              ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.add),
              title: const Text('Create new vault'),
              onTap: () {
                Navigator.pop(context);
                _createVault(context, ref);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _createVault(BuildContext context, WidgetRef ref) async {
    final name = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New vault'),
        content: TextField(
          controller: name,
          decoration: const InputDecoration(labelText: 'Vault name'),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              final n = name.text.trim();
              if (n.isEmpty) return;
              // Point the gate at a brand-new vault id → setup flow runs.
              ref.read(selectedVaultProvider.notifier).state =
                  VaultInfo(id: const Uuid().v4(), name: n);
              Navigator.pop(context);
            },
            child: const Text('Continue'),
          ),
        ],
      ),
    );
  }

  Future<void> _showLogDisclaimer(BuildContext context, WidgetRef ref) async {
    final actions = ref.read(settingsActionsProvider);
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Export error log'),
        // Exact disclaimer text from PRD §5B.
        content: const Text(
          'This file contains error messages and device info. It does not '
          'contain your financial data. Review before sharing.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Export')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    await _run(context, actions.exportErrorLog,
        shareText: 'Khazana error log (no financial data)');
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title);
  final String title;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.md, AppSpacing.md, AppSpacing.md, AppSpacing.xs),
      child: Text(
        title,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: AppColors.accent,
              fontWeight: FontWeight.bold,
            ),
      ),
    );
  }
}
