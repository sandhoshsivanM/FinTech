import 'package:meta/meta.dart';

import 'entitlement.dart';

/// What a store or licence check found.
///
/// Three-valued, and that is the whole point. Collapsing "the store says you
/// never bought this" and "the store did not answer" into one nullable result
/// is the single most common way an offline paywall locks out someone who
/// paid: the app goes offline, the query fails, the null is read as "no
/// purchase", and Pro disappears on a flight.
sealed class RestoreOutcome {
  const RestoreOutcome();
}

/// A purchase or licence was found.
@immutable
class RestoreFound extends RestoreOutcome {
  const RestoreFound(this.entitlement);
  final Entitlement entitlement;
}

/// The store answered, and there is genuinely no purchase on this account.
///
/// Still not grounds to revoke on its own — see the two-strikes rule in
/// [EntitlementNotifier]. The overwhelmingly common cause is being signed into
/// a different Apple ID or Google account than the one that bought it.
@immutable
class RestoreAbsent extends RestoreOutcome {
  const RestoreAbsent();
}

/// We could not ask. Offline, store unreachable, plugin not available on this
/// platform, user cancelled the system dialog. Never changes the entitlement.
@immutable
class RestoreUnavailable extends RestoreOutcome {
  const RestoreUnavailable(this.reason);
  final String reason;
}

/// The result of attempting a purchase.
sealed class PurchaseOutcome {
  const PurchaseOutcome();
}

@immutable
class PurchaseSucceeded extends PurchaseOutcome {
  const PurchaseSucceeded(this.entitlement);
  final Entitlement entitlement;
}

/// The user backed out. Not an error, and must not show one.
@immutable
class PurchaseCancelled extends PurchaseOutcome {
  const PurchaseCancelled();
}

@immutable
class PurchaseFailed extends PurchaseOutcome {
  const PurchaseFailed(this.message);
  final String message;
}

/// Where an entitlement can come from: an app store, or a signed licence key.
///
/// Implementations are deliberately thin — no policy, no caching, no
/// decisions. Everything that could be wrong lives in [EntitlementNotifier],
/// which is testable without a store; these adapters only translate. That is
/// what makes it legitimate for the test suite never to touch
/// `in_app_purchase`.
abstract interface class EntitlementSource {
  /// Purchases arriving outside a purchase call: a restore on another device,
  /// a deferred/pending purchase completing, a family-shared copy appearing.
  Stream<Entitlement> changes();

  /// Ask what this account/device already owns.
  Future<RestoreOutcome> restore();

  /// Begin a purchase. On stores this presents the system sheet.
  Future<PurchaseOutcome> purchase();

  /// The displayable price, e.g. "₹999". Null when the store has not answered
  /// yet — the paywall shows a neutral label rather than a wrong number.
  Future<String?> displayPrice();

  /// Finalise a purchase with the store.
  ///
  /// **Google Play auto-refunds any purchase that is not acknowledged within
  /// three days.** Forgetting this call does not fail loudly; it silently
  /// refunds every customer three days after they pay. It is a no-op on
  /// sources that have nothing to acknowledge.
  Future<void> complete(Entitlement entitlement);

  /// Release listeners.
  Future<void> dispose();
}
