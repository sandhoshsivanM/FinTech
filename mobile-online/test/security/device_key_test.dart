import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_online/core/dpop.dart';
import 'package:khazana_online/security/device_key_provider.dart';
import 'package:khazana_online/security/device_signer.dart';
import 'package:khazana_online/security/ecdsa_der.dart';
import 'package:khazana_online/security/hardware_key.dart';
import 'package:pointycastle/export.dart';

import 'fakes.dart';

void main() {
  group('DER conversion', () {
    test('round-trips, including short and high-bit integers', () {
      for (var i = 0; i < 50; i++) {
        final raw = DeviceKey.generate().signRaw(Uint8List.fromList([i]));
        expect(derEcdsaToRaw(rawToDer(raw)), raw);
      }
      final raw = Uint8List(64)..[31] = 1..[63] = 0x80;
      expect(derEcdsaToRaw(rawToDer(raw)), raw);
    });
    test('rejects malformed input', () {
      for (final bad in [
        Uint8List(0),
        Uint8List.fromList([0x30, 0x00]),
        Uint8List.fromList([0x31, 0x06, 2, 1, 1, 2, 1, 1]),
        Uint8List.fromList([0x30, 0x07, 2, 1, 1, 2, 1, 1]), // length overruns
        Uint8List.fromList([0x30, 0x08, 2, 1, 1, 2, 1, 1, 0, 0]), // trailing bytes
      ]) {
        expect(() => derEcdsaToRaw(bad), throwsA(isA<DerFormatException>()));
      }
    });
    test('JWK from an uncompressed point', () {
      final k = DeviceKey.generate();
      expect(p256JwkFromUncompressed(uncompressed(k), base64UrlNoPad), k.jwk);
      expect(() => p256JwkFromUncompressed(Uint8List(65), base64UrlNoPad), throwsA(isA<DerFormatException>()));
    });
  });

  group('hardware signer', () {
    test('a DPoP proof signed in "hardware" verifies against its JWK and carries no private data', () async {
      final hw = FakeHardware();
      final keys = HardenedDeviceKeys(hardware: hw, legacy: FakeLegacy());
      final signer = await keys.signer();
      expect(signer.protection, KeyProtection.hardware);
      final proof = await buildDpopProof(signer, 'post', Uri.parse('https://gw.test/v1/x?q=1'),
          accessToken: 'tok', now: DateTime.utc(2026, 10, 27));
      final parts = proof.split('.');
      final sig = Uint8List.fromList(base64Url.decode(base64Url.normalize(parts[2])));
      final pub = ECPublicKey(
          ECDomainParameters('prime256v1').curve.decodePoint(uncompressed(hw.keys.values.single)),
          ECDomainParameters('prime256v1'));
      expect(verifyEs256(Uint8List.fromList(ascii.encode('${parts[0]}.${parts[1]}')), sig, pub), isTrue);
      expect(proof, isNot(contains('"d"')));
      final payload = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1])))) as Map;
      expect(payload['htu'], 'https://gw.test/v1/x');
      expect(payload['htm'], 'POST');
      expect(payload.containsKey('ath'), isTrue);
    });

    test('same proof claims as the software DeviceKey (thumbprint matches)', () async {
      final hw = FakeHardware();
      final signer = await HardenedDeviceKeys(hardware: hw, legacy: FakeLegacy()).signer();
      expect(signer.thumbprint, hw.keys.values.single.thumbprint);
    });

    test('TEE is reported as trustedEnvironment', () async {
      final signer = await HardenedDeviceKeys(hardware: FakeHardware(lvl: HardwareLevel.tee), legacy: FakeLegacy()).signer();
      expect(signer.protection, KeyProtection.trustedEnvironment);
    });

    test('the key is created once and reused across provider instances', () async {
      final hw = FakeHardware();
      final a = await HardenedDeviceKeys(hardware: hw, legacy: FakeLegacy()).signer();
      final b = await HardenedDeviceKeys(hardware: hw, legacy: FakeLegacy()).signer();
      expect(hw.creates, 1);
      expect(a.thumbprint, b.thumbprint);
    });
  });

  group('migration from the software key', () {
    test('a live session keeps its software key (no key mismatch), flagged as software', () async {
      final legacy = FakeLegacy()
        ..stored = DeviceKey.generate().export()
        ..session = true;
      final hw = FakeHardware();
      final keys = HardenedDeviceKeys(hardware: hw, legacy: legacy);
      final s = await keys.signer();
      expect(s.protection, KeyProtection.software);
      expect(hw.creates, 0);
      expect(legacy.stored, isNotNull);
    });

    test('the next sign-in mints the hardware key and erases the software key', () async {
      final legacy = FakeLegacy()
        ..stored = DeviceKey.generate().export()
        ..session = true;
      final hw = FakeHardware();
      final keys = HardenedDeviceKeys(hardware: hw, legacy: legacy);
      final old = await keys.signer();
      legacy.session = false; // signed out
      await keys.prepareForNewSession();
      final now = await keys.signer();
      expect(now.protection, KeyProtection.hardware);
      expect(now.thumbprint, isNot(old.thumbprint));
      expect(legacy.stored, isNull);
    });

    test('no session: a stale software key is replaced at once', () async {
      final legacy = FakeLegacy()..stored = DeviceKey.generate().export();
      final s = await HardenedDeviceKeys(hardware: FakeHardware(), legacy: legacy).signer();
      expect(s.protection, KeyProtection.hardware);
      expect(legacy.stored, isNull);
    });
  });

  group('software fallback', () {
    test('only without hardware, flagged, and persisted', () async {
      final legacy = FakeLegacy();
      final keys = HardenedDeviceKeys(hardware: FakeHardware(lvl: HardwareLevel.none), legacy: legacy);
      final s = await keys.signer();
      expect(s.protection, KeyProtection.software);
      expect(legacy.stored, isNotNull);
      expect(keys.protection, KeyProtection.software);
    });
    test('can be forbidden: fails closed', () async {
      final keys = HardenedDeviceKeys(
          hardware: FakeHardware(lvl: HardwareLevel.none), legacy: FakeLegacy(), allowSoftwareFallback: false);
      await expectLater(keys.signer(), throwsA(isA<HardwareKeyUnavailable>()));
    });
  });
}
