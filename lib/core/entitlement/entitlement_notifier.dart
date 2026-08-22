import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/entitlement/entitlement.dart';
import '../../domain/entitlement/entitlement_source.dart';
import 'entitlement_cache.dart';

/// Holds the current [Entitlement] and every decision about changing it.
///
/// The governing rule, which the tests pin:
///
/// > **The entitlement system's job is to make paying easy, not to make
/// > not-paying hard.**
///
/// Every ambiguous state resolves in the user's favour. We would rather leave
/// Pro switched on for someone who refunded than take it away from someone who
/// paid and happens to be offline, signed into the wrong store account, or
/// standing in a lift.
class EntitlementNotifier extends StateNotifier<Entitlement> {
  EntitlementNotifier({
    required EntitlementSource source,
    required EntitlementCache cache,
    DateTime Function() clock = DateTime.now,
  })  : _source = source,
        _cache = cache,
        _clock = clock,
        // Start from cache, synchronously. Never `await` a store call before
        // the first frame: a slow store would mean a paying user watching a
        // paywall flash past on every cold start.
        super(cache.read());

  final EntitlementSource _source;
  final EntitlementCache _cache;
  final DateTime Function() _clock;
  StreamSubscription<Entitlement>? _sub;

  /// A single successful "you own nothing" is not enough to revoke. Two are,
  /// and only if they are this far apart — long enough that a wrong-account
  /// mistake has had a week to be noticed and fixed.
  static const Duration revokeGrace = Duration(days: 7);

  /// Begins background reconciliation. Safe to call once, after construction.
  ///
  /// Deliberately not awaited by any caller: it is a background correction to
  /// state that is already usable.
  Future<void> start() async {
    _sub = _source.changes().listen(
          _grant,
          onError: (_) {/* a stream error is not evidence of anything */},
        );
    await refresh();
  }

  /// Silent reconciliation against the store. Called on launch and when the
  /// user returns to the app.
  ///
  /// On stores, this is also what makes a reinstall invisible: the purchase
  /// comes back before the user has any reason to look for a paywall.
  Future<void> refresh() async {
    final outcome = await _source.restore();
    switch (outcome) {
      case RestoreFound(:final entitlement):
        _grant(entitlement);
      case RestoreUnavailable():
        // We could not ask. Change nothing at all — not the state, not the
        // missing-since marker. An unanswered question is not a "no".
        break;
      case RestoreAbsent():
        _noteAbsent();
    }
  }

  /// User-initiated "Restore purchases". Unlike [refresh] the caller wants to
  /// report what happened, so the outcome is returned rather than swallowed.
  Future<RestoreOutcome> restoreInteractive() async {
    final outcome = await _source.restore();
    if (outcome is RestoreFound) _grant(outcome.entitlement);
    // Note: an interactive `absent` does NOT revoke. The user pressed a button
    // hoping for good news; punishing them for asking would be perverse.
    return outcome;
  }

  Future<PurchaseOutcome> purchase() async {
    final outcome = await _source.purchase();
    if (outcome is PurchaseSucceeded) _grant(outcome.entitlement);
    return outcome;
  }

  /// Applies a licence key that has already been verified by the caller.
  void applyVerified(Entitlement entitlement) => _grant(entitlement);

  /// Removes a licence from this device. Used by "remove licence" in Settings —
  /// for handing a machine on, not as a punishment.
  void clear() {
    _cache.clear();
    state = Entitlement.free;
  }

  void _grant(Entitlement granted) {
    final next = granted.copyWith(
      lastVerifiedAt: _clock(),
      grantedAt: state.grantedAt ?? granted.grantedAt ?? _clock(),
      clearMissingSince: true, // a confirmed purchase resets any suspicion
    );
    _cache.write(next);
    state = next;
    // Play auto-refunds anything unacknowledged after three days. Fire and
    // forget: a failure here must not surface as a purchase failure, and the
    // next launch retries it anyway.
    unawaited(_source.complete(next).catchError((_) {}));
  }

  /// A *successful* store query came back with no purchase.
  void _noteAbsent() {
    if (!state.isPro) return; // nothing to lose

    final since = state.missingSince;
    if (since == null) {
      // Strike one. Record it and carry on as Pro. Almost always the wrong
      // store account.
      final next = state.copyWith(missingSince: _clock());
      _cache.write(next);
      state = next;
      return;
    }

    if (_clock().difference(since) < revokeGrace) return; // still in grace

    // Strike two, a week or more later. Downgrade — but only the entitlement.
    // Nothing Pro created is deleted, hidden or degraded; gated screens simply
    // show the paywall again, and every record stays in the vault, in exports
    // and in backups.
    _cache.write(Entitlement.free);
    state = Entitlement.free;
  }

  @override
  void dispose() {
    _sub?.cancel();
    unawaited(_source.dispose());
    super.dispose();
  }
}
