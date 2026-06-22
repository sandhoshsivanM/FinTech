import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/di/providers.dart';
import '../core/security/vault_state.dart';
import '../core/theme/app_tokens.dart';

/// App-level gate: routes between vault setup, PIN/biometric unlock, and the
/// cooldown lockout (PRD §14, §4B).
class UnlockGateScreen extends ConsumerWidget {
  const UnlockGateScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(vaultUnlockProvider);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: switch (state) {
                VaultUnlocking() => const _Busy(),
                VaultUninitialized() => const _SetupForm(),
                VaultLocked() => _UnlockForm(state: state),
                VaultCooldown() => _CooldownView(until: state.until),
                VaultUnlocked() => const _Busy(),
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _Busy extends StatelessWidget {
  const _Busy();
  @override
  Widget build(BuildContext context) => const Center(
        child: CircularProgressIndicator(
          semanticsLabel: 'Working',
        ),
      );
}

/// First-run: create a PIN. PRD requires a PIN before the vault exists.
class _SetupForm extends ConsumerStatefulWidget {
  const _SetupForm();
  @override
  ConsumerState<_SetupForm> createState() => _SetupFormState();
}

class _SetupFormState extends ConsumerState<_SetupForm> {
  final _pin = TextEditingController();
  final _confirm = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _pin.dispose();
    _confirm.dispose();
    super.dispose();
  }

  void _submit() {
    final pin = _pin.text;
    if (pin.length < 4) {
      setState(() => _error = 'PIN must be at least 4 digits.');
      return;
    }
    if (pin != _confirm.text) {
      setState(() => _error = 'PINs do not match.');
      return;
    }
    setState(() => _error = null);
    ref.read(vaultUnlockProvider.notifier).createVault(pin);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Icon(Icons.lock_outline, size: 56, color: AppColors.accent),
        const SizedBox(height: AppSpacing.md),
        Text('Set up your vault',
            style: Theme.of(context).textTheme.headlineSmall,
            textAlign: TextAlign.center),
        const SizedBox(height: AppSpacing.sm),
        Text('Your PIN encrypts everything on this device. It is never stored.',
            style: Theme.of(context).textTheme.bodyMedium,
            textAlign: TextAlign.center),
        const SizedBox(height: AppSpacing.lg),
        _PinField(controller: _pin, label: 'Create PIN'),
        const SizedBox(height: AppSpacing.md),
        _PinField(controller: _confirm, label: 'Confirm PIN'),
        if (_error != null) ...[
          const SizedBox(height: AppSpacing.sm),
          _ErrorText(_error!),
        ],
        const SizedBox(height: AppSpacing.lg),
        FilledButton(
          onPressed: _submit,
          child: const Text('Create vault'),
        ),
      ],
    );
  }
}

class _UnlockForm extends ConsumerStatefulWidget {
  const _UnlockForm({required this.state});
  final VaultLocked state;
  @override
  ConsumerState<_UnlockForm> createState() => _UnlockFormState();
}

class _UnlockFormState extends ConsumerState<_UnlockForm> {
  final _pin = TextEditingController();

  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.state;
    final showBiometric = s.biometricAvailable && !s.biometricExhausted;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Icon(Icons.shield_outlined, size: 56, color: AppColors.accent),
        const SizedBox(height: AppSpacing.md),
        Text('Unlock',
            style: Theme.of(context).textTheme.headlineSmall,
            textAlign: TextAlign.center),
        const SizedBox(height: AppSpacing.lg),
        _PinField(
          controller: _pin,
          label: 'Enter PIN',
          onSubmitted: (_) => _submitPin(),
        ),
        if (s.lastError != null) ...[
          const SizedBox(height: AppSpacing.sm),
          _ErrorText(s.lastError!),
        ],
        const SizedBox(height: AppSpacing.lg),
        FilledButton(
          onPressed: _submitPin,
          child: const Text('Unlock'),
        ),
        if (showBiometric) ...[
          const SizedBox(height: AppSpacing.md),
          OutlinedButton.icon(
            onPressed: () =>
                ref.read(vaultUnlockProvider.notifier).unlockWithBiometric(),
            icon: const Icon(Icons.fingerprint),
            label: const Text('Use biometrics'),
          ),
        ],
      ],
    );
  }

  void _submitPin() {
    ref.read(vaultUnlockProvider.notifier).unlockWithPin(_pin.text);
    _pin.clear();
  }
}

class _CooldownView extends StatefulWidget {
  const _CooldownView({required this.until});
  final DateTime until;
  @override
  State<_CooldownView> createState() => _CooldownViewState();
}

class _CooldownViewState extends State<_CooldownView> {
  late Timer _ticker;
  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _ticker.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final remaining = widget.until.difference(DateTime.now()).inSeconds;
    final secs = remaining < 0 ? 0 : remaining;
    return Semantics(
      liveRegion: true,
      label: 'Locked. Try again in $secs seconds.',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.timer_outlined, size: 56, color: AppColors.expense),
          const SizedBox(height: AppSpacing.md),
          Text('Too many attempts',
              style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: AppSpacing.sm),
          Text('Try again in $secs s',
              style: Theme.of(context).textTheme.bodyLarge),
        ],
      ),
    );
  }
}

class _PinField extends StatelessWidget {
  const _PinField({
    required this.controller,
    required this.label,
    this.onSubmitted,
  });
  final TextEditingController controller;
  final String label;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      obscureText: true,
      keyboardType: TextInputType.number,
      autofillHints: const [],
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
        prefixIcon: const Icon(Icons.pin),
      ),
    );
  }
}

/// Error display: text + icon, never color alone (PRD §10A error identification).
class _ErrorText extends StatelessWidget {
  const _ErrorText(this.message);
  final String message;
  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: AppColors.expense, size: 20),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(message,
                style: const TextStyle(color: AppColors.expense)),
          ),
        ],
      ),
    );
  }
}
