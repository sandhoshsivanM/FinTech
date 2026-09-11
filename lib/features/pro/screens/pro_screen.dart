import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/entitlement/distribution_channel.dart';
import '../../../core/entitlement/entitlement_providers.dart';
import '../../../core/entitlement/license_public_key.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../domain/entitlement/entitlement.dart';
import '../../../domain/entitlement/entitlement_source.dart';
import '../../../domain/entitlement/license_key.dart';
import '../../../presentation/glass_card.dart';
import '../pro_copy.dart';

/// The paywall, and the place an existing purchase is restored.
///
/// Reachable from every gated screen, and permanently from Settings — someone
/// who has already paid comes here looking for "Restore", and it must be
/// findable without first hitting a wall.
class ProScreen extends ConsumerStatefulWidget {
  const ProScreen({super.key});

  @override
  ConsumerState<ProScreen> createState() => _ProScreenState();
}

class _ProScreenState extends ConsumerState<ProScreen> {
  final _licence = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _licence.dispose();
    super.dispose();
  }

  void _say(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _buy() => _run(() async {
        final outcome = await ref.read(entitlementProvider.notifier).purchase();
        switch (outcome) {
          case PurchaseSucceeded():
            _say(ProCopy.purchaseOk);
          case PurchaseCancelled():
            break; // Not an error. The user changed their mind, which is fine.
          case PurchaseFailed(:final message):
            _say(message);
        }
      });

  Future<void> _restore() => _run(() async {
        final outcome =
            await ref.read(entitlementProvider.notifier).restoreInteractive();
        _say(switch (outcome) {
          RestoreFound() => ProCopy.restoredOk,
          RestoreAbsent() => ProCopy.restoreNothingFound,
          RestoreUnavailable() => ProCopy.restoreUnavailable,
        });
      });

  Future<void> _activate() => _run(() async {
        final source = ref.read(licenseSourceProvider);
        if (source == null) return;
        if (kLicensePublicKeyIsPlaceholder) {
          _say(ProCopy.licenceNotConfigured);
          return;
        }

        final check = await source.activate(_licence.text);
        _say(switch (check.verdict) {
          LicenseVerdict.valid => ProCopy.licenceOk,
          LicenseVerdict.malformed => ProCopy.licenceMalformed,
          LicenseVerdict.badSignature => ProCopy.licenceBadSignature,
          LicenseVerdict.wrongProduct => ProCopy.licenceWrongProduct,
          LicenseVerdict.unsupportedVersion => ProCopy.licenceUnsupported,
        });
        if (check.isValid) _licence.clear();
      });

  @override
  Widget build(BuildContext context) {
    final entitlement = ref.watch(entitlementProvider);
    final price = ref.watch(proPriceProvider).valueOrNull;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text(ProCopy.title),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.md, AppSpacing.sm, AppSpacing.md, 96),
          children: [
            if (entitlement.isPro)
              _UnlockedCard(entitlement: entitlement)
            else
              _PitchCard(
                price: price ?? ProCopy.priceFallback,
                busy: _busy,
                onBuy: kUsesStoreBilling ? _buy : null,
              ),

            const SizedBox(height: AppSpacing.md),
            const _BenefitsCard(),
            const SizedBox(height: AppSpacing.md),

            // The promise that makes the free tier trustworthy. On the paywall
            // itself, not buried in the terms — it is the thing that makes
            // "not now" a safe answer, and a user who feels safe saying no is
            // the one who comes back and says yes.
            GlassCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.lock_open_outlined,
                      size: 18, color: context.colors.income),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      ProCopy.freeForeverNote,
                      style: TextStyle(
                        height: 1.45,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),

            // Apple Guideline 3.1.1 REQUIRES a restore affordance for a
            // non-consumable. It stays visible even when already Pro, because
            // that is when people hunt for it — after a device migration.
            if (kUsesStoreBilling) ...[
              GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(ProCopy.restoreTitle,
                        style: TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text(
                      ProCopy.restoreBody,
                      style: TextStyle(
                          color:
                              Theme.of(context).colorScheme.onSurfaceVariant),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    OutlinedButton(
                      onPressed: _busy ? null : _restore,
                      child: const Text(ProCopy.restoreTitle),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),
            ],

            // Compiled out of App Store builds entirely — see
            // distribution_channel.dart. A licence field guarded by a runtime
            // `if` is still in the binary and is a 3.1.1 rejection waiting to
            // happen.
            if (kUsesLicenseKeys && !entitlement.isPro) ...[
              _LicenceCard(
                controller: _licence,
                busy: _busy,
                onActivate: _activate,
              ),
              const SizedBox(height: AppSpacing.md),
            ],

            _EcosystemNote(),
          ],
        ),
      ),
    );
  }
}

class _PitchCard extends StatelessWidget {
  const _PitchCard({required this.price, required this.busy, this.onBuy});

  final String price;
  final bool busy;
  final VoidCallback? onBuy;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(ProCopy.title,
              style: Theme.of(context)
                  .textTheme
                  .headlineSmall
                  ?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text(ProCopy.tagline,
              style: TextStyle(
                  height: 1.45,
                  color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const SizedBox(height: AppSpacing.md),
          Text(price,
              style: Theme.of(context)
                  .textTheme
                  .headlineMedium
                  ?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: AppSpacing.md),
          if (onBuy != null)
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: busy ? null : onBuy,
                child: Text(busy ? 'Working…' : 'Unlock Khazana Pro'),
              ),
            )
          else
            Text(
              'Khazana Pro for this app is bought on the website, and unlocked '
              'with the licence key you are emailed.',
              style: TextStyle(
                  height: 1.45,
                  color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
        ],
      ),
    );
  }
}

class _UnlockedCard extends StatelessWidget {
  const _UnlockedCard({required this.entitlement});
  final Entitlement entitlement;

  @override
  Widget build(BuildContext context) {
    final ref = entitlement.orderRef;
    return GlassCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Row(
        children: [
          Icon(Icons.verified_outlined, color: context.colors.income),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Khazana Pro is unlocked',
                    style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  // A hashed order reference, never an email or a name — the
                  // client deliberately holds no personal data about a buyer.
                  ref == null
                      ? 'Thank you.'
                      : 'Licence …${ref.substring(ref.length - 4)}',
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BenefitsCard extends StatelessWidget {
  const _BenefitsCard();

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final b in ProCopy.benefits) ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: EdgeInsets.only(top: 2),
                  child: Icon(Icons.check_circle_outline,
                      size: 17, color: context.colors.accent),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(b.title,
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 2),
                      Text(b.body,
                          style: TextStyle(
                              height: 1.4,
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSurfaceVariant)),
                    ],
                  ),
                ),
              ],
            ),
            if (b != ProCopy.benefits.last)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.sm),
                child: Divider(height: 1),
              ),
          ],
        ],
      ),
    );
  }
}

class _LicenceCard extends StatelessWidget {
  const _LicenceCard({
    required this.controller,
    required this.busy,
    required this.onActivate,
  });

  final TextEditingController controller;
  final bool busy;
  final VoidCallback onActivate;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(ProCopy.licenceTitle,
              style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: AppSpacing.sm),
          TextField(
            controller: controller,
            autocorrect: false,
            enableSuggestions: false,
            decoration: const InputDecoration(
              hintText: ProCopy.licenceHint,
              border: OutlineInputBorder(),
            ),
            onSubmitted: (_) => onActivate(),
          ),
          const SizedBox(height: 6),
          Text(ProCopy.licenceHelp,
              style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const SizedBox(height: AppSpacing.sm),
          FilledButton(
            onPressed: busy ? null : onActivate,
            child: const Text('Activate'),
          ),
        ],
      ),
    );
  }
}

class _EcosystemNote extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
      child: Text(
        kUsesStoreBilling
            ? ProCopy.ecosystemNoteStore
            : ProCopy.ecosystemNoteDirect,
        style: TextStyle(
          fontSize: 12,
          height: 1.45,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}
