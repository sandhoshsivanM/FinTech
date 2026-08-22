import 'dart:async';

import 'package:in_app_purchase/in_app_purchase.dart';

import '../../core/entitlement/distribution_channel.dart';
import '../../domain/entitlement/entitlement.dart';
import '../../domain/entitlement/entitlement_source.dart';

/// Entitlement from StoreKit (iOS, iPadOS, macOS) or Play Billing (Android).
///
/// A thin translator with no policy of its own — every decision about what to
/// do with a result lives in [EntitlementNotifier], which is why the test suite
/// never needs to touch `in_app_purchase`.
///
/// macOS is served by `in_app_purchase_storekit`, which declares a macOS
/// platform implementation, so one Universal Purchase of `khazana_pro` covers
/// iPhone, iPad and Mac with no extra code.
class StoreEntitlementSource implements EntitlementSource {
  StoreEntitlementSource({InAppPurchase? iap})
      : _iap = iap ?? InAppPurchase.instance;

  /// One product id across all four storefronts. Enable Universal Purchase and
  /// Family Sharing on it in App Store Connect.
  static const String productId = 'khazana_pro';

  final InAppPurchase _iap;
  final _controller = StreamController<Entitlement>.broadcast();
  StreamSubscription<List<PurchaseDetails>>? _sub;

  /// Completers for an in-flight interactive purchase. The plugin reports the
  /// result on the broadcast stream rather than from the `buy` future, so the
  /// call has to bridge the two.
  Completer<PurchaseOutcome>? _pending;

  bool _started = false;

  void _ensureStarted() {
    if (_started) return;
    _started = true;
    _sub = _iap.purchaseStream.listen(
      _onPurchases,
      onError: (_) {/* transport noise is not evidence of anything */},
    );
  }

  @override
  Stream<Entitlement> changes() {
    _ensureStarted();
    return _controller.stream;
  }

  @override
  Future<RestoreOutcome> restore() async {
    if (!kUsesStoreBilling) {
      return const RestoreUnavailable('Not a store build.');
    }
    _ensureStarted();

    if (!await _iap.isAvailable()) {
      // Offline, or a device with purchases disabled. Explicitly *not*
      // `absent` — we did not get an answer, so nothing may change.
      return const RestoreUnavailable('Store unavailable.');
    }

    // restorePurchases() reports through purchaseStream, not by returning.
    // Anything it finds arrives at _onPurchases and is pushed to changes(),
    // so a positive result is never missed; the value here only reports
    // whether we managed to ask at all.
    try {
      await _iap.restorePurchases();
      return const RestoreAbsent();
    } catch (e) {
      return RestoreUnavailable('$e');
    }
  }

  @override
  Future<PurchaseOutcome> purchase() async {
    if (!kUsesStoreBilling) {
      return const PurchaseFailed('Not a store build.');
    }
    _ensureStarted();

    if (!await _iap.isAvailable()) {
      return const PurchaseFailed(
          'The store is not reachable right now. Please try again.');
    }

    final response = await _iap.queryProductDetails({productId});
    if (response.productDetails.isEmpty) {
      // Almost always a configuration problem — product not approved, wrong
      // bundle id, or the tester's account is in the wrong region.
      return const PurchaseFailed('Khazana Pro is not available on this store.');
    }

    final completer = Completer<PurchaseOutcome>();
    _pending = completer;

    final started = await _iap.buyNonConsumable(
      purchaseParam: PurchaseParam(
        productDetails: response.productDetails.first,
      ),
    );
    if (!started) {
      _pending = null;
      return const PurchaseFailed('Could not start the purchase.');
    }

    return completer.future;
  }

  @override
  Future<String?> displayPrice() async {
    if (!kUsesStoreBilling) return null;
    try {
      if (!await _iap.isAvailable()) return null;
      final r = await _iap.queryProductDetails({productId});
      // The store's own localised, tax-inclusive string — never a price we
      // format ourselves, which would be wrong in most of the world.
      return r.productDetails.isEmpty ? null : r.productDetails.first.price;
    } catch (_) {
      return null;
    }
  }

  /// No-op here: acknowledgement happens in [_onPurchases], the moment the
  /// purchase is seen, rather than waiting for anyone to call us back.
  @override
  Future<void> complete(Entitlement entitlement) async {}

  void _onPurchases(List<PurchaseDetails> purchases) {
    for (final p in purchases) {
      switch (p.status) {
        case PurchaseStatus.purchased:
        case PurchaseStatus.restored:
          if (p.productID != productId) break;
          final entitlement = Entitlement(
            isPro: true,
            source: _sourceForPlatform(),
            grantedAt: _transactionDate(p),
            orderRef: p.purchaseID,
          );
          _controller.add(entitlement);
          _pending?.complete(PurchaseSucceeded(entitlement));
          _pending = null;

        case PurchaseStatus.error:
          _pending?.complete(
              PurchaseFailed(p.error?.message ?? 'The purchase failed.'));
          _pending = null;

        case PurchaseStatus.canceled:
          // Not an error and must never show one — the user simply changed
          // their mind, which is allowed.
          _pending?.complete(const PurchaseCancelled());
          _pending = null;

        case PurchaseStatus.pending:
          // Ask-to-Buy, or a slow bank. Leave the completer open; the real
          // outcome arrives on this same stream, possibly days later.
          break;
      }

      // MUST run for every finished purchase, including restores and errors.
      //
      // Google Play AUTO-REFUNDS any purchase that is not acknowledged within
      // three days. It fails silently: the customer pays, the app unlocks, and
      // three days later the money goes back and Pro disappears. This single
      // line is the difference between being paid and not.
      if (p.pendingCompletePurchase) {
        unawaited(_iap.completePurchase(p).catchError((_) {}));
      }
    }
  }

  ProSource _sourceForPlatform() =>
      kChannel == Channel.play ? ProSource.playStore : ProSource.appStore;

  DateTime? _transactionDate(PurchaseDetails p) {
    final raw = p.transactionDate;
    if (raw == null) return null;
    final ms = int.tryParse(raw);
    return ms == null ? null : DateTime.fromMillisecondsSinceEpoch(ms);
  }

  @override
  Future<void> dispose() async {
    await _sub?.cancel();
    await _controller.close();
  }
}
