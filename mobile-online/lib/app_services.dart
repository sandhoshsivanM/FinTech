// The app's long-lived parts, wired once: the gateway, this device's account
// keys, the local record store, the sync engine and the ledger writer.
// Mirrors webapp-online/src/lib/account.ts.
import 'dart:io' show Platform;

import 'core/config.dart';
import 'core/gateway_client.dart';
import 'core/key_store.dart';
import 'keys/account_keys.dart';
import 'ledger/ledger.dart';
import 'sync/engine.dart';
import 'sync/record_store.dart';

enum Readiness { signedOut, needsSetup, ready }

class AppServices {
  AppServices({required this.gateway, required KeyStore keyStore, required this.records, String? deviceName, String? platform})
      : deviceName = deviceName ?? _defaultDeviceName(),
        platform = platform ?? platformName() {
    keys = AccountKeys(gateway, keyStore);
    engine = SyncEngine(gateway.call, records);
    writer = LedgerWriter(() => keys.dataKey, engine);
  }

  final GatewayClient gateway;
  final MemoryRecordStore records;
  final String deviceName;
  final String platform;
  late final AccountKeys keys;
  late final SyncEngine engine;
  late final LedgerWriter writer;

  /// Set after a mobile-number sign-in: until then the home screen offers to
  /// add a passkey (the server allows it only within minutes of signing in).
  DateTime? passkeyOfferUntil;

  static String _defaultDeviceName() => Platform.isIOS ? 'iPhone' : (Platform.isAndroid ? 'Android phone' : 'Mac');

  Future<Ledger> ledger() async => readLedger(keys.dataKey, await records.all());

  Future<Readiness>? _readying;

  /// Brings this device to "ready": signed in, registered, data key unlocked.
  /// Callers at the same moment share one run (two registers at once made the second a 409).
  Future<Readiness> ensureReady() {
    final run = _readying ??= _getReady();
    return run.whenComplete(() => _readying = null);
  }

  Future<Readiness> _getReady() async {
    if (!await gateway.isSignedIn()) return Readiness.signedOut;
    if (keys.unlocked) return Readiness.ready;
    try {
      final status = await keys.register(deviceName, platform);
      if (status.hasKey) {
        if (!await keys.unlock()) await keys.unlockFromServer();
        return Readiness.ready;
      }
      if (status.accountHasKeys && await keys.adoptLocalKey()) return Readiness.ready;
      return Readiness.needsSetup;
    } on ApiException catch (e) {
      if (e.status == 401) return Readiness.signedOut;
      rethrow;
    }
  }

  /// Signs out on the server, then forgets the session, every key and every
  /// synced record on this device.
  Future<void> signOut({bool everywhere = false}) async {
    try {
      await gateway.signOut(everywhere: everywhere);
    } finally {
      await keys.forget();
      await records.reset();
    }
  }
}
