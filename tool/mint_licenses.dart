// Offline licence minting for Khazana Pro.
//
//   dart run tool/mint_licenses.dart --generate-keypair
//   dart run tool/mint_licenses.dart --private-key <base64> --count 1000 > keys.txt
//
// Why a pool of pre-signed keys rather than a signing endpoint:
//
// Somebody has to hold the Ed25519 private key and produce a signature per
// order. The obvious design is a small web service, and that would be the first
// server Khazana has ever had — the one thing the product promises it does not
// have. A pool sidesteps it entirely: mint ten thousand keys here, on a laptop,
// upload the list to the merchant of record as a code list, and it hands one
// out per order. Nothing is hosted, nothing is exposed, and the client still
// never contacts anything to verify.
//
// The private key never enters this repository, never enters CI, and belongs in
// a password manager with a paper backup. Lose it and no customer can ever be
// issued a replacement; leak it and anyone can mint licences.
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

import 'package:khazana/domain/entitlement/license_key.dart';

Future<void> main(List<String> args) async {
  if (args.contains('--generate-keypair')) {
    await _generateKeypair();
    return;
  }

  final privateB64 = _arg(args, '--private-key');
  if (privateB64 == null) {
    stderr.writeln(_usage);
    exit(2);
  }

  final count = int.tryParse(_arg(args, '--count') ?? '100') ?? 100;
  final algo = Ed25519();
  final seed = base64Decode(privateB64);
  if (seed.length != 32) {
    stderr.writeln('Private key must be 32 bytes (base64). Got ${seed.length}.');
    exit(2);
  }
  final keyPair = await algo.newKeyPairFromSeed(seed);

  final rng = Random.secure();
  final issuedAt = DateTime.now().toUtc();
  final seen = <String>{};

  for (var i = 0; i < count; i++) {
    // The order reference is 8 random bytes here rather than a hash of a real
    // order id, because a pooled key is minted before any order exists. It is
    // still the handle that ties a key to whoever it was sold to: record which
    // key went to which order at the merchant, and a key posted publicly can be
    // traced back so that order is declined a re-issue.
    final orderRef = Uint8List.fromList(
      List.generate(8, (_) => rng.nextInt(256)),
    );
    final payload =
        LicenseKey.buildPayload(issuedAt: issuedAt, orderRefBytes: orderRef);
    final signature = await algo.sign(payload, keyPair: keyPair);
    final key = LicenseKey.encode(payload, signature.bytes);

    // Astronomically unlikely with 64 random bits, but a duplicate key sold to
    // two customers is the kind of thing you only discover from a support
    // ticket, so it costs nothing to be sure.
    if (!seen.add(key)) {
      i--;
      continue;
    }
    stdout.writeln(key);
  }

  stderr.writeln('Minted $count keys.');
}

Future<void> _generateKeypair() async {
  final algo = Ed25519();
  final pair = await algo.newKeyPair();
  final seed = await pair.extractPrivateKeyBytes();
  final pub = await pair.extractPublicKey();

  stderr.writeln('''
=== KHAZANA LICENCE KEY PAIR ===

PRIVATE KEY (base64) — store in a password manager, plus a paper backup.
Never commit it. Never put it in CI. Losing it means no customer can ever be
issued a replacement key.

  ${base64Encode(seed)}

PUBLIC KEY — paste into lib/core/entitlement/license_public_key.dart and
webapp/src/lib/entitlement/licensePublicKey.ts (both must match exactly):

  ${_dartLiteral(pub.bytes)}

  ${_tsLiteral(pub.bytes)}
''');
}

String _dartLiteral(List<int> bytes) {
  final rows = <String>[];
  for (var i = 0; i < bytes.length; i += 8) {
    rows.add('  ${bytes.sublist(i, i + 8).join(', ')},');
  }
  return 'const List<int> kLicensePublicKey = <int>[\n${rows.join('\n')}\n];';
}

String _tsLiteral(List<int> bytes) =>
    'export const LICENSE_PUBLIC_KEY = new Uint8Array([${bytes.join(', ')}]);';

String? _arg(List<String> args, String name) {
  final i = args.indexOf(name);
  return (i == -1 || i + 1 >= args.length) ? null : args[i + 1];
}

const _usage = '''
Usage:
  dart run tool/mint_licenses.dart --generate-keypair
  dart run tool/mint_licenses.dart --private-key <base64> [--count 100]

Keys are written to stdout, one per line, ready to upload to the merchant of
record as a code list. Progress goes to stderr, so `> keys.txt` gives a clean
file.
''';
