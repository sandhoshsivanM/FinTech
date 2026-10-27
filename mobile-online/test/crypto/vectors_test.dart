// The Dart crypto must produce and open exactly the bytes the web client does:
// contracts/crypto/vectors.json is the shared contract.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_online/crypto/bytes.dart';
import 'package:khazana_online/crypto/e2e.dart';
import 'package:khazana_online/crypto/phrase.dart';
import 'package:khazana_online/crypto/wordlist.dart';
import 'package:pointycastle/export.dart';

void main() {
  final v = jsonDecode(File('../contracts/crypto/vectors.json').readAsStringSync()) as Map<String, dynamic>;
  final dek = fromHex(v['dek_hex'] as String);

  test('the word list is the BIP-39 English list', () {
    expect(bip39Words.length, 2048);
    final file = '${bip39Words.join('\n')}\n';
    expect(toHex(SHA256Digest().process(Uint8List.fromList(utf8.encode(file)))),
        '2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda');
    expect({for (final w in bip39Words) w.length < 4 ? w : w.substring(0, 4)}.length, 2048);
  });

  test('key check', () {
    expect(toBase64(keyCheck(dek)), v['key_check']);
  });

  test('device envelope: derives the public key, opens the pinned envelope', () async {
    final d = v['device'] as Map<String, dynamic>;
    final keys = await x25519FromBoxSeed(fromHex(d['seed_hex'] as String));
    expect(toBase64(keys.publicKey), d['public_key']);
    expect(await openDeviceEnvelope(fromBase64(d['sealed_dek'] as String), keys), dek);
  });

  test('device envelope: seal then open round trip; a stranger cannot open it', () async {
    final a = await newX25519KeyPair();
    final b = await newX25519KeyPair();
    final sealed = await sealToDevice(dek, a.publicKey);
    expect(sealed.length, 80);
    expect(await openDeviceEnvelope(sealed, a), dek);
    await expectLater(openDeviceEnvelope(sealed, b), throwsA(isA<KeyError>()));
    final tampered = Uint8List.fromList(sealed)..[60] ^= 1;
    await expectLater(openDeviceEnvelope(tampered, a), throwsA(isA<KeyError>()));
  });

  test('recovery phrase: entropy to the pinned words and back', () {
    final r = v['recovery'] as Map<String, dynamic>;
    final words = toPhrase(fromHex(r['entropy_hex'] as String));
    expect(words.join(' '), r['words']);
    expect(parsePhrase((r['words'] as String).toUpperCase().replaceAll(' ', ',  ')), words);
  });

  test('recovery phrase: rejects a wrong count, unknown word and bad checksum', () {
    expect(() => parsePhrase('legal winner'), throwsA(isA<PhraseError>()));
    expect(() => parsePhrase(List.filled(24, 'zzzz').join(' ')), throwsA(isA<PhraseError>()));
    final words = toPhrase(Uint8List(32)).toList()..[0] = 'zoo';
    expect(() => parsePhrase(words.join(' ')), throwsA(isA<PhraseError>()));
  });

  test('recovery envelope: pinned bytes (Argon2id 64 MiB) and unwrap', () {
    final r = v['recovery'] as Map<String, dynamic>;
    final words = (r['words'] as String).split(' ');
    final blob = wrapForRecovery(dek, words, salt: fromHex(r['salt_hex'] as String), nonce: fromHex(r['nonce_hex'] as String));
    expect(toBase64(blob), r['blob']);
    expect(unwrapRecovery(fromBase64(r['blob'] as String), words), dek);
    final wrong = toPhrase(Uint8List(32));
    expect(() => unwrapRecovery(blob, wrong), throwsA(isA<KeyError>()));
  }, timeout: const Timeout(Duration(minutes: 3)));

  test('record: pinned ciphertext, opens, and is bound to its id', () {
    final r = v['record'] as Map<String, dynamic>;
    final id = RecordId(r['record_id'] as String, r['collection'] as String, r['key_version'] as int);
    final value = r['value'] as Map<String, dynamic>;
    final blob = encryptRecord(dek, id, value, nonce: fromHex(r['nonce_hex'] as String));
    expect(toBase64(blob), r['ciphertext']);
    expect(decryptRecord(dek, id, fromBase64(r['ciphertext'] as String)), value);
    expect(() => decryptRecord(dek, RecordId('acct-0002', id.collection, 1), blob), throwsA(isA<KeyError>()));
    expect(() => decryptRecord(dek, RecordId(id.recordId, 'transactions', 1), blob), throwsA(isA<KeyError>()));
    expect(() => decryptRecord(dek, RecordId(id.recordId, id.collection, 2), blob), throwsA(isA<KeyError>()));
  });
}
