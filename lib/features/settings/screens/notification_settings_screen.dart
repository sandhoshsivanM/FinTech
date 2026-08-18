import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/notification_providers.dart';
import '../../../core/services/notification_sync_service.dart';
import '../../../domain/services/notification_scheduler.dart';

/// Notification settings.
///
/// The screen is also where permission is asked for — on a tap, having read what
/// it is for. Asking at launch is how an app gets permanently denied, and on the
/// web a denial is unrecoverable without digging into browser site settings.
class NotificationSettingsScreen extends ConsumerStatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  ConsumerState<NotificationSettingsScreen> createState() =>
      _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState
    extends ConsumerState<NotificationSettingsScreen> {
  bool? _permitted;
  int _pending = 0;

  @override
  void initState() {
    super.initState();
    _refreshStatus();
  }

  Future<void> _refreshStatus() async {
    final service = ref.read(notificationServiceProvider);
    final permitted = await service.hasPermission();
    final pending = await service.pending();
    if (!mounted) return;
    setState(() {
      _permitted = permitted;
      _pending = pending.length;
    });
  }

  Future<void> _setEnabled(bool on) async {
    final notifier = ref.read(notifyPrefsProvider.notifier);
    if (on) {
      final granted = await ref.read(notificationServiceProvider).requestPermission();
      if (!mounted) return;
      if (!granted) {
        // Recording "on" while the OS says no would leave a switch claiming
        // something the app cannot do.
        setState(() => _permitted = false);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Your device declined. Turn notifications on for Khazana in system settings, then try again.'),
        ));
        return;
      }
    }
    await notifier.setEnabled(on);
    await ref.read(notificationSyncProvider).reconcile();
    await _refreshStatus();
  }

  Future<void> _update(NotifyPrefs next) async {
    await ref.read(notifyPrefsProvider.notifier).set(next);
    await ref.read(notificationSyncProvider).reconcile();
    await _refreshStatus();
  }

  Future<void> _toggle(NotifyCategory c, bool on) async {
    await ref.read(notifyPrefsProvider.notifier).toggleCategory(c, on);
    await ref.read(notificationSyncProvider).reconcile();
    await _refreshStatus();
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(notifyPrefsProvider);
    final on = prefs.enabled;

    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: ListView(
        children: [
          SwitchListTile(
            value: on,
            onChanged: _setEnabled,
            title: const Text('Allow notifications'),
            subtitle: const Text(
                'Reminders are scheduled on this device. Nothing is sent to a server.'),
          ),
          if (_permitted == false)
            const ListTile(
              leading: Icon(Icons.info_outline),
              title: Text('Your device is blocking notifications'),
              subtitle: Text(
                  'Khazana can schedule them, but the system will not show them until it is allowed in system settings.'),
            ),

          const _SectionHeader('What to tell you about'),
          _CategoryTile(
            category: NotifyCategory.bills,
            title: 'Bills and recurring transactions',
            subtitle: 'Before a scheduled transaction is due',
            enabled: on,
            prefs: prefs,
            onChanged: _toggle,
          ),
          _CategoryTile(
            category: NotifyCategory.renewals,
            title: 'Insurance renewals',
            subtitle: 'Before a policy renews',
            enabled: on,
            prefs: prefs,
            onChanged: _toggle,
          ),
          _CategoryTile(
            category: NotifyCategory.goals,
            title: 'Goal target dates',
            enabled: on,
            prefs: prefs,
            onChanged: _toggle,
          ),
          _CategoryTile(
            category: NotifyCategory.budget,
            title: 'Budget thresholds',
            subtitle: 'When you record a transaction that crosses one',
            enabled: on,
            prefs: prefs,
            onChanged: _toggle,
          ),
          _CategoryTile(
            category: NotifyCategory.market,
            title: 'Price and weight alerts',
            subtitle: 'Only while Khazana is open — see below',
            enabled: on,
            prefs: prefs,
            onChanged: _toggle,
          ),
          _CategoryTile(
            category: NotifyCategory.digest,
            title: 'Evening digest',
            subtitle: 'One summary of what is coming up',
            enabled: on,
            prefs: prefs,
            onChanged: _toggle,
          ),

          const _SectionHeader('Timing'),
          _HourTile(
            title: 'Remind me at',
            value: prefs.reminderHour,
            enabled: on,
            onChanged: (h) => _update(prefs.copyWith(reminderHour: h)),
          ),
          _HourTile(
            title: 'Quiet hours start',
            value: prefs.quietStartMin ~/ 60,
            enabled: on,
            onChanged: (h) => _update(prefs.copyWith(quietStartMin: h * 60)),
          ),
          _HourTile(
            title: 'Quiet hours end',
            value: prefs.quietEndMin ~/ 60,
            enabled: on,
            onChanged: (h) => _update(prefs.copyWith(quietEndMin: h * 60)),
          ),
          _DaysTile(
            title: 'Bills — how far ahead',
            value: prefs.billsLeadDays,
            enabled: on,
            onChanged: (d) => _update(prefs.copyWith(billsLeadDays: d)),
          ),
          _DaysTile(
            title: 'Renewals — how far ahead',
            value: prefs.renewalsLeadDays,
            enabled: on,
            options: const [7, 14, 30, 45, 60],
            onChanged: (d) => _update(prefs.copyWith(renewalsLeadDays: d)),
          ),
          _DaysTile(
            title: 'Goals — how far ahead',
            value: prefs.goalsLeadDays,
            enabled: on,
            options: const [7, 14, 30, 60, 90],
            onChanged: (d) => _update(prefs.copyWith(goalsLeadDays: d)),
          ),

          const _SectionHeader('Privacy'),
          SwitchListTile(
            value: prefs.hideAmounts,
            onChanged: on
                ? (v) => _update(prefs.copyWith(hideAmounts: v))
                : null,
            title: const Text('Keep amounts off the lock screen'),
            subtitle: const Text(
                'A notification preview is the one place Khazana\'s data is visible without your PIN.'),
          ),

          const _SectionHeader('What this can and cannot do'),
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text(
              'Bills, renewals and goal dates are handed to your phone\'s own '
              'scheduler in advance, so they arrive even with Khazana closed. '
              'Their wording is written when Khazana is last open, so it '
              'describes what was true then.\n\n'
              'Budget and price alerts are different: they depend on data that '
              'has to be looked at. Budgets are checked the moment you record a '
              'transaction. Prices are only ever as fresh as your last refresh, '
              'so a price alert can only fire while Khazana is open — there is '
              'no server watching the market on your behalf, and adding one '
              'would mean telling it which stocks you follow.',
            ),
          ),
          ListTile(
            leading: const Icon(Icons.schedule_outlined),
            title: Text('$_pending reminder${_pending == 1 ? '' : 's'} scheduled'),
            subtitle: const Text('Held by your device, not by Khazana'),
            trailing: IconButton(
              icon: const Icon(Icons.refresh),
              tooltip: 'Rebuild',
              onPressed: () async {
                await ref.read(notificationSyncProvider).reconcile();
                await _refreshStatus();
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({
    required this.category,
    required this.title,
    required this.enabled,
    required this.prefs,
    required this.onChanged,
    this.subtitle,
  });

  final NotifyCategory category;
  final String title;
  final String? subtitle;
  final bool enabled;
  final NotifyPrefs prefs;
  final void Function(NotifyCategory, bool) onChanged;

  @override
  Widget build(BuildContext context) => SwitchListTile(
        value: prefs.categories.contains(category),
        onChanged: enabled ? (v) => onChanged(category, v) : null,
        title: Text(title),
        subtitle: subtitle == null ? null : Text(subtitle!),
      );
}

class _HourTile extends StatelessWidget {
  const _HourTile({
    required this.title,
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final String title;
  final int value;
  final bool enabled;
  final ValueChanged<int> onChanged;

  static String label(int h) =>
      '${h.toString().padLeft(2, '0')}:00';

  @override
  Widget build(BuildContext context) => ListTile(
        enabled: enabled,
        title: Text(title),
        trailing: DropdownButton<int>(
          value: value.clamp(0, 23),
          onChanged: enabled ? (v) => v == null ? null : onChanged(v) : null,
          items: [
            for (var h = 0; h < 24; h++)
              DropdownMenuItem(value: h, child: Text(label(h))),
          ],
        ),
      );
}

class _DaysTile extends StatelessWidget {
  const _DaysTile({
    required this.title,
    required this.value,
    required this.enabled,
    required this.onChanged,
    this.options = const [0, 1, 2, 3, 5, 7],
  });

  final String title;
  final int value;
  final bool enabled;
  final List<int> options;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    // A value saved before an option list changed must still be selectable, or
    // the dropdown asserts on a value it has no item for.
    final items = {...options, value}.toList()..sort();
    return ListTile(
      enabled: enabled,
      title: Text(title),
      trailing: DropdownButton<int>(
        value: value,
        onChanged: enabled ? (v) => v == null ? null : onChanged(v) : null,
        items: [
          for (final d in items)
            DropdownMenuItem(
              value: d,
              child: Text(d == 0 ? 'On the day' : '$d day${d == 1 ? '' : 's'}'),
            ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title);
  final String title;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
        child: Text(
          title,
          style: Theme.of(context)
              .textTheme
              .labelLarge
              ?.copyWith(color: Theme.of(context).colorScheme.primary),
        ),
      );
}
