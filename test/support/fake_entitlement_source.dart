import 'dart:async';

import 'package:khazana/domain/entitlement/entitlement.dart';
import 'package:khazana/domain/entitlement/entitlement_source.dart';

/// A programmable [EntitlementSource] for testing paywall logic without a store.
///
/// This is legitimate rather than a cheat because `StoreEntitlementSource` is
/// deliberately a logic-free translator: every decision worth testing —
/// when to grant, when to revoke, what an unanswered query means — lives in
/// `EntitlementNotifier`, above this seam. Testing against a real StoreKit
/// sandbox would exercise Apple's code, not ours, and could not be run in CI.
class FakeEntitlementSource implements EntitlementSource {
  FakeEntitlementSource({
    List<RestoreOutcome>? restoreScript,
    this.purchaseOutcome = const PurchaseCancelled(),
    this.price = '₹999',
  }) : _restoreScript = restoreScript ?? const [];

  /// Consumed one per `restore()` call. Once exhausted, the last entry repeats
  /// — so a test that wants "absent forever" writes it once.
  final List<RestoreOutcome> _restoreScript;
  int _restoreCalls = 0;

  PurchaseOutcome purchaseOutcome;
  String? price;

  final _controller = StreamController<Entitlement>.broadcast();

  /// Every entitlement handed to [complete]. The Play acknowledgement guard is
  /// asserted against this: Play auto-refunds anything unacknowledged after
  /// three days, silently, so "was complete() called" is worth a test.
  final List<Entitlement> completed = [];

  int get restoreCalls => _restoreCalls;
  bool disposed = false;

  /// Pushes an out-of-band change, as a restore on another device would.
  void emit(Entitlement e) => _controller.add(e);

  @override
  Stream<Entitlement> changes() => _controller.stream;

  @override
  Future<RestoreOutcome> restore() async {
    _restoreCalls++;
    if (_restoreScript.isEmpty) return const RestoreUnavailable('no script');
    final i = _restoreCalls - 1;
    return _restoreScript[i < _restoreScript.length
        ? i
        : _restoreScript.length - 1];
  }

  @override
  Future<PurchaseOutcome> purchase() async => purchaseOutcome;

  @override
  Future<String?> displayPrice() async => price;

  @override
  Future<void> complete(Entitlement entitlement) async =>
      completed.add(entitlement);

  @override
  Future<void> dispose() async {
    disposed = true;
    await _controller.close();
  }
}
