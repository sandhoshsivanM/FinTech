import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/domain/entitlement/license_key.dart';

/// The licence key verifier.
///
/// Khazana Pro on desktop and web is unlocked by an Ed25519-signed key that is
/// checked entirely on-device. That is the whole reason the product can keep
/// its no-server promise while still taking money: a merchant's own licence
/// feature would need a `/validate` round trip on every unlock, which would
/// break Pro on a plane and would quietly tell that merchant who is running the
/// app and when.
///
/// The fixture is shared with `webapp/src/lib/entitlement/license.test.ts`, so
/// the Dart and TypeScript verifiers cannot drift into disagreeing about
/// whether a customer's key is good.
void main() {
  final fixture = jsonDecode(
    File('test/fixtures/license_keys.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  final publicKey =
      ((fixture['testKeyPair'] as Map)['publicKey'] as List).cast<int>();
  final cases = (fixture['cases'] as List).cast<Map<String, dynamic>>();

  group('shared fixture', () {
    for (final c in cases) {
      test(c['name'] as String, () async {
        final check = await LicenseKey.verify(c['key'] as String, publicKey);
        expect(check.verdict.name, c['verdict'],
            reason: 'key: ${c['key']}');
      });
    }
  });

  group('forgery and tampering', () {
    late SimpleKeyPair pair;
    late List<int> pub;
    final algo = Ed25519();

    Future<String> mint({
      DateTime? issuedAt,
      List<int>? orderRef,
      SimpleKeyPair? signWith,
    }) async {
      final payload = LicenseKey.buildPayload(
        issuedAt: issuedAt ?? DateTime.utc(2026, 3, 12),
        orderRefBytes: orderRef ?? List.filled(8, 0xAB),
      );
      final sig = await algo.sign(payload, keyPair: signWith ?? pair);
      return LicenseKey.encode(payload, sig.bytes);
    }

    setUp(() async {
      pair = await algo.newKeyPairFromSeed(
          Uint8List.fromList(List.generate(32, (i) => i)));
      pub = (await pair.extractPublicKey()).bytes;
    });

    test('a key we minted verifies under our public key', () async {
      final check = await LicenseKey.verify(await mint(), pub);
      expect(check.isValid, isTrue);
      expect(check.orderRef, 'ABABABABABABABAB');
      expect(check.issuedAt, DateTime.utc(2026, 3, 12));
    });

    test('a key signed by a different pair is refused', () async {
      // What an attacker with their own Ed25519 keypair produces. The payload
      // is perfectly well formed; only the signature is theirs.
      final other = await algo.newKeyPairFromSeed(
          Uint8List.fromList(List.filled(32, 9)));
      final forged = await mint(signWith: other);

      final check = await LicenseKey.verify(forged, pub);
      expect(check.verdict, LicenseVerdict.badSignature);
    });

    test('flipping one payload byte invalidates the key', () async {
      final good = await mint();
      final body = good.substring(LicenseKey.prefix.length);
      final bytes = base64Url.decode(body + '=' * ((4 - body.length % 4) % 4));
      bytes[5] ^= 0xFF; // inside orderRef
      final tampered =
          '${LicenseKey.prefix}${base64Url.encode(bytes).replaceAll('=', '')}';

      final check = await LicenseKey.verify(tampered, pub);
      expect(check.verdict, LicenseVerdict.badSignature);
    });

    test('a key for a different product is refused, not silently accepted',
        () async {
      final payload = LicenseKey.buildPayload(
        issuedAt: DateTime.utc(2026, 3, 12),
        orderRefBytes: List.filled(8, 1),
      );
      payload[1] = 0x02; // some other product
      final sig = await algo.sign(payload, keyPair: pair);

      final check = await LicenseKey.verify(
          LicenseKey.encode(payload, sig.bytes), pub);
      expect(check.verdict, LicenseVerdict.wrongProduct);
    });

    test('a key from a future format version is refused rather than guessed at',
        () async {
      final payload = LicenseKey.buildPayload(
        issuedAt: DateTime.utc(2026, 3, 12),
        orderRefBytes: List.filled(8, 1),
      );
      payload[0] = 0x02;
      final sig = await algo.sign(payload, keyPair: pair);

      final check = await LicenseKey.verify(
          LicenseKey.encode(payload, sig.bytes), pub);
      expect(check.verdict, LicenseVerdict.unsupportedVersion);
    });

    test('the all-zero placeholder public key accepts nothing', () async {
      // The shipped default until a real pair is minted. It must refuse
      // everything rather than accidentally accepting a degenerate signature.
      final check = await LicenseKey.verify(await mint(), List.filled(32, 0));
      expect(check.isValid, isFalse);
    });

    test('hyphens are payload, not decoration, and are never stripped',
        () async {
      // `-` is a real base64url character. An earlier version stripped it as
      // if it were a readability separator, which corrupted the payload of
      // every key that contained one — i.e. most of them. Inserting hyphens
      // must therefore CHANGE the key, not be silently forgiven.
      final good = await mint();
      final mangled =
          good.replaceAllMapped(RegExp(r'.{8}'), (m) => '${m[0]}-');
      expect((await LicenseKey.verify(mangled, pub)).isValid, isFalse);

      // Whitespace, however, is decoration and is forgiven.
      final wrapped = good.replaceAllMapped(
          RegExp(r'.{40}'), (m) => '${m[0]}\n');
      expect((await LicenseKey.verify(wrapped, pub)).isValid, isTrue);
    });
  });

  group('there is no expiry to get wrong', () {
    test('a key issued long ago is still valid', () async {
      // Deliberate: a perpetual licence has nothing to compare against a clock,
      // which is exactly what makes offline verification sound. The day an
      // expiry field exists, verification needs trustworthy time and the whole
      // design needs a server. issuedAt is display only.
      final algo = Ed25519();
      final pair = await algo.newKeyPairFromSeed(
          Uint8List.fromList(List.generate(32, (i) => i)));
      final pub = (await pair.extractPublicKey()).bytes;

      final payload = LicenseKey.buildPayload(
        issuedAt: DateTime.utc(2020, 1, 2),
        orderRefBytes: List.filled(8, 7),
      );
      final sig = await algo.sign(payload, keyPair: pair);
      final check =
          await LicenseKey.verify(LicenseKey.encode(payload, sig.bytes), pub);

      expect(check.isValid, isTrue);
      expect(check.issuedAt, DateTime.utc(2020, 1, 2));
    });
  });
}
