import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/entitlement/entitlement_cache.dart';
import 'package:khazana/core/entitlement/entitlement_notifier.dart';
import 'package:khazana/domain/entitlement/entitlement.dart';
import 'package:khazana/domain/entitlement/entitlement_source.dart';

import '../support/fake_entitlement_source.dart';

/// The rules that decide when someone has Pro.
///
/// The governing principle, and the reason most of these tests are about
/// *refusing* to revoke:
///
/// > The entitlement system's job is to make paying easy, not to make
/// > not-paying hard.
///
/// We would far rather leave Pro on for somebody who refunded than take it away
/// from somebody who paid and is offline, on a plane, or signed into the wrong
/// Google account. The failure modes are not symmetric: one costs us ₹999, the
/// other costs us a one-star review and a refund request, and is the kind of
/// thing people write about.
void main() {
  const proEntitlement =
      Entitlement(isPro: true, source: ProSource.appStore, orderRef: 'ABCD');

  late DateTime now;
  DateTime clock() => now;

  setUp(() => now = DateTime.utc(2026, 3, 1));

  EntitlementNotifier build({
    List<RestoreOutcome>? script,
    Entitlement cached = Entitlement.free,
    FakeEntitlementSource? source,
  }) {
    return EntitlementNotifier(
      source: source ?? FakeEntitlementSource(restoreScript: script),
      cache: MemoryEntitlementCache(cached),
      clock: clock,
    );
  }

  group('startup', () {
    test('the cached entitlement is available synchronously', () {
      // Never await a store before the first frame: a slow store would mean a
      // paying customer watching a paywall flash past on every cold start.
      final notifier = build(cached: proEntitlement);
      expect(notifier.state.isPro, isTrue);
    });

    test('no cache means free', () {
      expect(build().state.isPro, isFalse);
    });

    test('a corrupt cache degrades to free rather than throwing', () {
      // Exercised through the prefs cache in entitlement_cache.dart; here we
      // only assert the notifier is happy to start from Free.
      expect(build(cached: Entitlement.free).state, Entitlement.free);
    });
  });

  group('the store cannot be reached', () {
    test('an unavailable store never downgrades', () async {
      final notifier = build(
        cached: proEntitlement,
        script: [const RestoreUnavailable('offline')],
      );
      await notifier.refresh();

      expect(notifier.state.isPro, isTrue,
          reason: 'being offline is not evidence that you did not pay');
    });

    test('an unavailable store does not even start the revoke clock', () async {
      final notifier = build(
        cached: proEntitlement,
        script: [const RestoreUnavailable('offline')],
      );
      await notifier.refresh();

      expect(notifier.state.missingSince, isNull,
          reason: 'an unanswered question is not a "no"');
    });
  });

  group('the store says there is no purchase', () {
    test('one miss does not revoke — it is usually the wrong account',
        () async {
      final notifier = build(
        cached: proEntitlement,
        script: [const RestoreAbsent()],
      );
      await notifier.refresh();

      expect(notifier.state.isPro, isTrue);
      expect(notifier.state.missingSince, now);
    });

    test('a second miss within the grace period still does not revoke',
        () async {
      final source =
          FakeEntitlementSource(restoreScript: [const RestoreAbsent()]);
      final notifier = build(cached: proEntitlement, source: source);

      await notifier.refresh();
      now = now.add(const Duration(days: 3));
      await notifier.refresh();

      expect(notifier.state.isPro, isTrue,
          reason: 'three days is not long enough to be sure');
    });

    test('two misses a week apart do revoke', () async {
      final source =
          FakeEntitlementSource(restoreScript: [const RestoreAbsent()]);
      final notifier = build(cached: proEntitlement, source: source);

      await notifier.refresh();
      now = now.add(EntitlementNotifier.revokeGrace + const Duration(hours: 1));
      await notifier.refresh();

      expect(notifier.state.isPro, isFalse);
    });

    test('a purchase found after a miss clears the suspicion', () async {
      final source = FakeEntitlementSource(restoreScript: [
        const RestoreAbsent(),
        const RestoreFound(proEntitlement),
      ]);
      final notifier = build(cached: proEntitlement, source: source);

      await notifier.refresh(); // strike one
      expect(notifier.state.missingSince, isNotNull);

      await notifier.refresh(); // signed back into the right account
      expect(notifier.state.missingSince, isNull);
      expect(notifier.state.isPro, isTrue);
    });

    test('pressing Restore and finding nothing never revokes', () async {
      // The user pressed a button hoping for good news. Punishing them for
      // asking would be perverse, and it is the exact moment someone with a
      // wrong-account problem is most likely to press it.
      final notifier = build(
        cached: proEntitlement,
        script: [const RestoreAbsent()],
      );
      final outcome = await notifier.restoreInteractive();

      expect(outcome, isA<RestoreAbsent>());
      expect(notifier.state.isPro, isTrue);
    });

    test('a free user seeing "absent" stays free without drama', () async {
      final notifier = build(script: [const RestoreAbsent()]);
      await notifier.refresh();
      expect(notifier.state, Entitlement.free);
    });
  });

  group('purchase', () {
    test('a successful purchase grants Pro and is acknowledged', () async {
      final source = FakeEntitlementSource()
        ..purchaseOutcome = const PurchaseSucceeded(proEntitlement);
      final notifier = build(source: source);

      final outcome = await notifier.purchase();

      expect(outcome, isA<PurchaseSucceeded>());
      expect(notifier.state.isPro, isTrue);
      // Google Play AUTO-REFUNDS any purchase not acknowledged within three
      // days, silently. This assertion is the guard against shipping a build
      // that refunds every customer three days after they pay.
      expect(source.completed, hasLength(1));
    });

    test('a cancelled purchase is not an error and changes nothing', () async {
      final notifier = build(
        source: FakeEntitlementSource()
          ..purchaseOutcome = const PurchaseCancelled(),
      );
      final outcome = await notifier.purchase();

      expect(outcome, isA<PurchaseCancelled>());
      expect(notifier.state.isPro, isFalse);
    });

    test('a failed purchase leaves an existing entitlement alone', () async {
      final notifier = build(
        cached: proEntitlement,
        source: FakeEntitlementSource()
          ..purchaseOutcome = const PurchaseFailed('network'),
      );
      await notifier.purchase();
      expect(notifier.state.isPro, isTrue);
    });
  });

  group('out-of-band changes', () {
    test('a purchase restored on another device arrives on the stream',
        () async {
      final source = FakeEntitlementSource();
      final notifier = build(source: source);
      await notifier.start();

      source.emit(proEntitlement);
      await Future<void>.delayed(Duration.zero);

      expect(notifier.state.isPro, isTrue);
    });
  });

  group('clearing', () {
    test('removing a licence returns to free', () {
      final notifier = build(cached: proEntitlement);
      notifier.clear();
      expect(notifier.state, Entitlement.free);
    });
  });

  group('grant bookkeeping', () {
    test('grantedAt is preserved across re-verification', () async {
      final source = FakeEntitlementSource(
        restoreScript: [const RestoreFound(proEntitlement)],
      );
      final notifier = build(
        cached: proEntitlement.copyWith(grantedAt: DateTime.utc(2026, 1, 1)),
        source: source,
      );

      await notifier.refresh();

      expect(notifier.state.grantedAt, DateTime.utc(2026, 1, 1),
          reason: 'the date they bought it does not change when we re-check');
      expect(notifier.state.lastVerifiedAt, now);
    });
  });
}
