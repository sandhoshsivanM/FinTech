// This device's part in Khazana Online's end-to-end encryption (ADR 0005),
// mirroring webapp-online/src/lib/keys.ts: register its X25519 key, get the
// account's data key (DEK) by creating it (first device), pairing with a device
// that has it, or the recovery phrase, and unlock it from the local envelope.
//
// The DEK exists only in memory here and on the user's other devices. The
// server holds envelopes it can't open and a hash of the key check. The device
// key pair and envelope live in the platform keystore (Keychain / Keystore).

import 'dart:typed_data';

import 'package:pointycastle/export.dart';

import '../core/key_store.dart';
import '../crypto/bytes.dart';
import '../crypto/e2e.dart';
import '../crypto/phrase.dart';

/// The gateway as AccountKeys uses it (GatewayClient.call).
abstract interface class Api {
  Future<Object?> call(String method, String path, [Object? body]);
}

typedef Json = Map<String, dynamic>;

class DeviceStatus {
  DeviceStatus.fromJson(Json j)
      : deviceId = j['device_id'] as String? ?? '',
        hasKey = j['has_key'] == true,
        accountHasKeys = j['account_has_keys'] == true;
  final String deviceId;
  final bool hasKey;
  final bool accountHasKeys;
}

class PairingTarget {
  PairingTarget.fromJson(Json j)
      : newDeviceId = j['new_device_id'] as String,
        name = j['name'] as String,
        platform = j['platform'] as String,
        publicKey = j['public_key'] as String;
  final String newDeviceId;
  final String name;
  final String platform;
  final String publicKey;
}

/// What a pairing link (shown as a QR code on the new device) carries. It
/// travels device to device, never through a server: id, one-time code and the
/// fingerprint of the new device's key.
class PairingLink {
  const PairingLink(this.id, this.code, this.fingerprint);
  final String id;
  final String code;
  final String fingerprint;

  /// The web app's `…/pair/#id=…&code=…&h=…` links parse too: only the fragment (or query) matters.
  static PairingLink? tryParse(String text) {
    final uri = Uri.tryParse(text.trim());
    if (uri == null) return null;
    final params = uri.fragment.isNotEmpty ? Uri.splitQueryString(uri.fragment) : uri.queryParameters;
    final id = params['id'], code = params['code'], h = params['h'];
    if (id == null || code == null || h == null || id.isEmpty || code.isEmpty || h.isEmpty) return null;
    return PairingLink(id, code, h);
  }

  String get text => 'khazana://pair#id=$id&code=${Uri.encodeQueryComponent(code)}&h=$fingerprint';
}

/// base64url(SHA-256(public key)): what a pairing link commits to.
String fingerprint(Uint8List publicKey) => base64UrlNoPadding(SHA256Digest().process(publicKey));

class AccountKeys {
  AccountKeys(this._api, this._store, {Future<void> Function(Duration)? sleep})
      : _sleep = sleep ?? Future<void>.delayed;

  final Api _api;
  final KeyStore _store;
  final Future<void> Function(Duration) _sleep;

  Uint8List? _dek;
  Future<X25519KeyPair>? _keys;

  /// The DEK, once unlocked.
  Uint8List get dataKey => _dek ?? (throw KeyError('Locked: this device has no data key yet.'));
  bool get unlocked => _dek != null;

  /// This device's X25519 key pair: created once and kept in the keystore.
  /// Concurrent callers share one load.
  Future<X25519KeyPair> deviceKeys() => _keys ??= _shared();

  Future<X25519KeyPair> _shared() async {
    try {
      return await _loadOrCreate();
    } on Object {
      _keys = null;
      rethrow;
    }
  }

  Future<X25519KeyPair> _loadOrCreate() async {
    final stored = await _store.readBoxSeed();
    if (stored != null) return x25519FromSeed(fromBase64(stored));
    final keys = await newX25519KeyPair();
    await _store.writeBoxSeed(toBase64(keys.privateKey));
    return keys;
  }

  /// Registers this device (idempotent for the same key) and returns its status.
  Future<DeviceStatus> register(String name, String platform) async {
    final keys = await deviceKeys();
    final j = await _api.call('POST', '/v1/devices/register', {
      'platform': platform,
      'public_key': toBase64(keys.publicKey),
      'name': name.length > 64 ? name.substring(0, 64) : name,
    });
    return DeviceStatus.fromJson(j as Json);
  }

  Future<DeviceStatus> status() async => DeviceStatus.fromJson(await _api.call('GET', '/v1/devices/me') as Json);

  /// Opens the DEK from this device's stored envelope. False if there isn't one.
  Future<bool> unlock() async {
    final envelope = await _store.readEnvelope();
    if (envelope == null) return false;
    _dek = await openDeviceEnvelope(fromBase64(envelope), await deviceKeys());
    return true;
  }

  /// Opens the DEK from this device's envelope on the server (when the local copy is gone).
  Future<void> unlockFromServer() async {
    final e = await _api.call('GET', '/v1/keys/envelopes/self') as Json;
    final sealed = fromBase64(e['wrapped_dek'] as String);
    await _keep(await openDeviceEnvelope(sealed, await deviceKeys()), sealed);
  }

  Future<void> _keep(Uint8List dek, Uint8List sealed) async {
    await _store.writeEnvelope(toBase64(sealed));
    _dek = dek;
  }

  Future<({Json wire, Uint8List sealed})> _ownEnvelope(Uint8List dek) async {
    final sealed = await sealToDevice(dek, (await deviceKeys()).publicKey);
    return (wire: <String, dynamic>{'wrapped_dek': toBase64(sealed), 'alg': deviceAlg, 'key_version': keyVersion}, sealed: sealed);
  }

  /// First device of a new account: a fresh DEK and a 24-word phrase. Show the
  /// words, then call `save()`; nothing reaches the server before that.
  ({List<String> words, Future<void> Function() save}) createAccountKey() {
    final dek = newDek();
    final words = toPhrase(randomBytes(32));
    return (
      words: words,
      save: () async {
        final own = await _ownEnvelope(dek);
        final recovery = wrapForRecovery(dek, words);
        await _api.call('POST', '/v1/keys/bootstrap', {
          'device': own.wire,
          'recovery': {'wrapped_dek': toBase64(recovery), 'alg': recoveryAlg, 'key_version': keyVersion},
          'key_check': toBase64(keyCheck(dek)),
        });
        await _keep(dek, own.sealed);
      },
    );
  }

  /// Another device: the recovery phrase opens the DEK, then this device gets its own envelope.
  Future<void> recover(String typed) async {
    final words = parsePhrase(typed);
    final r = await _api.call('GET', '/v1/keys/envelopes/recovery') as Json;
    final dek = unwrapRecovery(fromBase64(r['wrapped_dek'] as String), words);
    await _addOwnEnvelope(dek);
  }

  /// After signing in again on a device that still holds the DEK: give the
  /// new session's device its envelope.
  Future<bool> adoptLocalKey() async {
    if (!await unlock()) return false;
    await _addOwnEnvelope(dataKey);
    return true;
  }

  Future<void> _addOwnEnvelope(Uint8List dek) async {
    final own = await _ownEnvelope(dek);
    await _api.call('POST', '/v1/keys/envelopes/self', {'envelope': own.wire, 'key_check': toBase64(keyCheck(dek))});
    await _keep(dek, own.sealed);
  }

  /// New device: start pairing. Show the link as a QR code for a device that has the key.
  Future<({PairingLink link, DateTime expiresAt})> startPairing() async {
    final start = await _api.call('POST', '/v1/devices/pairing') as Json;
    final h = fingerprint((await deviceKeys()).publicKey);
    return (link: PairingLink(start['pairing_id'] as String, start['code'] as String, h), expiresAt: DateTime.parse(start['expires_at'] as String));
  }

  /// New device: wait until another device approves, then open the envelope it sealed for us.
  Future<bool> waitForApproval(DateTime until, {bool Function()? cancelled, DateTime Function()? now}) async {
    final clock = now ?? DateTime.now;
    while (clock().isBefore(until) && !(cancelled?.call() ?? false)) {
      if ((await status()).hasKey) {
        final e = await _api.call('GET', '/v1/keys/envelopes/self') as Json;
        final sealed = fromBase64(e['wrapped_dek'] as String);
        await _keep(await openDeviceEnvelope(sealed, await deviceKeys()), sealed);
        return true;
      }
      await _sleep(const Duration(seconds: 2));
    }
    return false;
  }

  /// Device with the key: look up the device asking to pair. Refuses unless
  /// its public key matches the fingerprint from the link, so the server can't
  /// swap in a key of its own.
  Future<PairingTarget> inspectPairing(PairingLink link) async {
    final target = PairingTarget.fromJson(await _api.call('GET', '/v1/devices/pairing/${Uri.encodeComponent(link.id)}') as Json);
    if (fingerprint(fromBase64(target.publicKey)) != link.fingerprint) {
      throw KeyError('The device asking to pair doesn’t match this code. Nothing was shared.');
    }
    return target;
  }

  /// Device with the key: seal the DEK to the new device and approve.
  Future<void> approvePairing(PairingLink link, PairingTarget target) async {
    final sealed = await sealToDevice(dataKey, fromBase64(target.publicKey));
    await _api.call('POST', '/v1/devices/pairing/${Uri.encodeComponent(link.id)}/approve', {
      'code': link.code,
      'envelope': {'wrapped_dek': toBase64(sealed), 'alg': deviceAlg, 'key_version': keyVersion},
    });
  }

  /// Sign-out: forget the data key and this device's key material.
  Future<void> forget() async {
    _dek = null;
    _keys = null;
    await _store.clearEncryptionKeys();
  }
}
