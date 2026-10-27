import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_online/core/key_store.dart';
import 'package:khazana_online/crypto/bytes.dart';
import 'package:khazana_online/crypto/e2e.dart';
import 'package:khazana_online/crypto/phrase.dart';
import 'package:khazana_online/keys/account_keys.dart';
import 'package:pointycastle/export.dart';

class ServerError implements Exception {
  ServerError(this.status);
  final int status;
}

/// A stand-in for the Devices service: the same rules, in memory.
class FakeDevices {
  final devices = <String, Map<String, dynamic>>{};
  Map<String, dynamic>? recovery;
  String? keyCheckHash;
  Map<String, dynamic>? pairing;
  String? swapKey;
  final calls = <String>[];

  Api as(String device) => _Api(this, device);

  String _hash(String b64) => toBase64(SHA256Digest().process(fromBase64(b64)));

  Map<String, dynamic> status(String device) => {
        'device_id': device,
        'has_key': devices[device]?['envelope'] != null,
        'account_has_keys': recovery != null,
        'key_version': recovery != null ? 1 : null,
      };

  Object? handle(String device, String method, String path, Map<String, dynamic>? body) {
    calls.add('$method $path');
    if (path == '/v1/devices/register') {
      devices[device] = {'publicKey': body!['public_key'], 'name': body['name'], 'envelope': devices[device]?['envelope']};
      return status(device);
    }
    final me = devices[device];
    if (me == null) throw ServerError(403);
    final route = '$method ${path.replaceAll(RegExp(r'[0-9a-f-]{16,}'), ':id')}';
    switch (route) {
      case 'GET /v1/devices/me':
        return status(device);
      case 'POST /v1/keys/bootstrap':
        if (recovery != null) throw ServerError(409);
        me['envelope'] = body!['device'];
        recovery = body['recovery'] as Map<String, dynamic>;
        keyCheckHash = _hash(body['key_check'] as String);
        return null;
      case 'GET /v1/keys/envelopes/recovery':
        return recovery;
      case 'GET /v1/keys/envelopes/self':
        return me['envelope'];
      case 'POST /v1/keys/envelopes/self':
        if (_hash(body!['key_check'] as String) != keyCheckHash) throw ServerError(403);
        me['envelope'] = body['envelope'];
        return null;
      case 'POST /v1/devices/pairing':
        pairing = {'id': '0198a8f0-0000-7000-8000-000000000001', 'code': 'one-time-code', 'device': device, 'open': true};
        return {'pairing_id': pairing!['id'], 'code': pairing!['code'], 'expires_at': DateTime.now().add(const Duration(minutes: 5)).toUtc().toIso8601String()};
      case 'GET /v1/devices/pairing/:id':
        final target = devices[pairing!['device']]!;
        return {'new_device_id': pairing!['device'], 'name': target['name'], 'platform': 'ios', 'public_key': swapKey ?? target['publicKey']};
      case 'POST /v1/devices/pairing/:id/approve':
        if (body!['code'] != pairing!['code'] || pairing!['open'] != true) throw ServerError(403);
        pairing!['open'] = false;
        devices[pairing!['device']]!['envelope'] = body['envelope'];
        return null;
    }
    throw StateError('unexpected $route');
  }
}

class _Api implements Api {
  _Api(this.server, this.device);
  final FakeDevices server;
  final String device;
  @override
  Future<Object?> call(String method, String path, [Object? body]) async =>
      server.handle(device, method, path, body as Map<String, dynamic>?);
}

AccountKeys _keys(FakeDevices s, String device, MemoryKeyStore store) => AccountKeys(s.as(device), store, sleep: (_) async {});

void main() {
  test('the first device creates the key; nothing reaches the server before the words are saved', () async {
    final server = FakeDevices();
    final store = MemoryKeyStore();
    final keys = _keys(server, 'phone', store);
    await keys.register('Phone', 'ios');
    final pending = keys.createAccountKey();
    expect(pending.words, hasLength(24));
    expect(server.recovery, isNull);
    expect(keys.unlocked, isFalse);
    await pending.save();
    expect(keys.unlocked, isTrue);
    expect(server.recovery, isNotNull);
    // The server sees only envelopes: neither holds the DEK in the clear.
    final dek = keys.dataKey;
    expect(server.devices['phone']!['envelope']['wrapped_dek'], isNot(toBase64(dek)));
    expect(server.keyCheckHash, toBase64(SHA256Digest().process(keyCheck(dek))));
  });

  test('the device key is stored in the keystore, survives a restart, and unlocks from the stored envelope', () async {
    final server = FakeDevices();
    final store = MemoryKeyStore();
    final first = _keys(server, 'phone', store);
    await first.register('Phone', 'ios');
    final pending = first.createAccountKey();
    await pending.save();
    final restarted = _keys(server, 'phone', store);
    expect(restarted.unlocked, isFalse);
    expect(await restarted.unlock(), isTrue);
    expect(restarted.dataKey, first.dataKey);
    expect((await restarted.deviceKeys()).publicKey, (await first.deviceKeys()).publicKey);
  });

  test('concurrent first calls share one key pair', () async {
    final keys = _keys(FakeDevices(), 'phone', MemoryKeyStore());
    final pairs = await Future.wait([keys.deviceKeys(), keys.deviceKeys(), keys.deviceKeys()]);
    expect(pairs.map((p) => toHex(p.publicKey)).toSet(), hasLength(1));
  });

  test('a second device pairs through the QR link and gets the same key', () async {
    final server = FakeDevices();
    final phone = _keys(server, 'phone', MemoryKeyStore());
    await phone.register('iPhone', 'ios');
    await phone.createAccountKey().save();

    final tablet = _keys(server, 'tablet', MemoryKeyStore());
    final status = await tablet.register('Tablet', 'android');
    expect(status.hasKey, isFalse);
    expect(status.accountHasKeys, isTrue);
    final start = await tablet.startPairing();
    // The link survives the QR code: text in, same link out.
    final link = PairingLink.tryParse(start.link.text)!;
    expect(link.fingerprint, start.link.fingerprint);

    final target = await phone.inspectPairing(link);
    expect(target.name, 'Tablet');
    await phone.approvePairing(link, target);
    expect(await tablet.waitForApproval(start.expiresAt), isTrue);
    expect(tablet.dataKey, phone.dataKey);
    // The link never went through the server: it holds no fingerprint.
    expect(server.calls.where((c) => c.contains(link.fingerprint)), isEmpty);
  });

  test('a web-style pairing link parses too, and junk does not', () {
    final link = PairingLink.tryParse('https://app.example/pair/#id=abc&code=x%20y&h=fp')!;
    expect((link.id, link.code, link.fingerprint), ('abc', 'x y', 'fp'));
    expect(PairingLink.tryParse('hello'), isNull);
    expect(PairingLink.tryParse('khazana://pair#id=abc'), isNull);
  });

  test('a pairing target whose key was swapped by the server is refused, and nothing is sealed', () async {
    final server = FakeDevices();
    final phone = _keys(server, 'phone', MemoryKeyStore());
    await phone.register('iPhone', 'ios');
    await phone.createAccountKey().save();
    final tablet = _keys(server, 'tablet', MemoryKeyStore());
    await tablet.register('Tablet', 'android');
    final start = await tablet.startPairing();
    server.swapKey = toBase64((await newX25519KeyPair()).publicKey);
    await expectLater(phone.inspectPairing(start.link), throwsA(isA<KeyError>()));
    expect(server.calls.where((c) => c.endsWith('/approve')), isEmpty);
  });

  test('a device recovers with the phrase (typed loosely); a wrong phrase is refused', () async {
    final server = FakeDevices();
    final phone = _keys(server, 'phone', MemoryKeyStore());
    await phone.register('iPhone', 'ios');
    final pending = phone.createAccountKey();
    await pending.save();

    final laptop = _keys(server, 'laptop', MemoryKeyStore());
    await laptop.register('Mac', 'macos');
    await expectLater(laptop.recover(toPhrase(Uint8List(32)).join(' ')), throwsA(isA<KeyError>()));
    expect(laptop.unlocked, isFalse);
    await laptop.recover(pending.words.map((w) => w.toUpperCase()).join(',  '));
    expect(laptop.dataKey, phone.dataKey);
    expect(server.devices['laptop']!['envelope'], isNotNull);
  }, timeout: const Timeout(Duration(minutes: 3)));

  test('forget wipes the key and the keystore', () async {
    final server = FakeDevices();
    final store = MemoryKeyStore();
    final keys = _keys(server, 'phone', store);
    await keys.register('iPhone', 'ios');
    await keys.createAccountKey().save();
    await keys.forget();
    expect(keys.unlocked, isFalse);
    expect(store.boxSeed, isNull);
    expect(store.envelope, isNull);
  });
}
