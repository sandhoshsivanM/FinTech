import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_online/security/attestation.dart';
import 'package:khazana_online/security/ecdsa_der.dart';
import 'package:khazana_online/security/pinning.dart';

const _goodPin = 'hd2M94SkpYReSMMcI6kXnoiR+eYmoYCbd4gPg/iXIAk='; // fixtures/server.pem
final _backupPin = base64.encode(List.filled(32, 7));
final _wrongPin = base64.encode(List.filled(32, 9));

Uint8List _certDer() {
  final pem = File('test/security/fixtures/server.pem').readAsStringSync();
  final b64 = pem.split('\n').where((l) => !l.startsWith('-----')).join();
  return base64.decode(b64);
}

void main() {
  group('PinPolicy config', () {
    final prod = Uri.parse('https://api.khazana.example');

    test('off when nothing is configured (demo domains, tunnels)', () {
      for (final u in ['http://10.0.2.2:5196', 'https://1-2-3-4.sslip.io', 'https://abc.trycloudflare.com']) {
        final p = PinPolicy.forGateway(Uri.parse(u), pinHost: '', pins: '');
        expect(p.enforced, isFalse, reason: u);
        expect(p.accepts(Uri.parse(u).host, Uint8List(3)), isTrue);
      }
    });

    test('off for a gateway that is not the pinned host', () {
      final p = PinPolicy.forGateway(Uri.parse('https://1-2-3-4.sslip.io'),
          pinHost: 'api.khazana.example', pins: '$_goodPin,$_backupPin');
      expect(p.enforced, isFalse);
    });

    test('on for the configured production host, case-insensitively', () {
      final p = PinPolicy.forGateway(Uri.parse('https://API.khazana.example'),
          pinHost: 'api.khazana.example', pins: ' $_goodPin , $_backupPin ');
      expect(p.enforced, isTrue);
      expect(p.pins, {_goodPin, _backupPin});
    });

    test('a bad pinned config throws instead of running unpinned', () {
      void bad(String pins, [Uri? u]) => expect(
          () => PinPolicy.forGateway(u ?? prod, pinHost: 'api.khazana.example', pins: pins),
          throwsA(isA<PinConfigException>()),
          reason: pins);
      bad(''); // none
      bad(_goodPin); // no backup pin
      bad('$_goodPin,not-base64!!');
      bad('$_goodPin,${base64.encode([1, 2, 3])}'); // wrong length
      bad('$_goodPin,$_backupPin', Uri.parse('http://api.khazana.example'));
    });

    test('accepts a matching pin, refuses others and garbage, only for the pinned host', () {
      final p = PinPolicy.forGateway(Uri.parse('https://localhost'), pinHost: 'localhost', pins: '$_goodPin,$_backupPin');
      expect(p.accepts('localhost', _certDer()), isTrue);
      expect(p.accepts('localhost', Uint8List.fromList([1, 2, 3, 4])), isFalse, reason: 'fail closed');
      final q = PinPolicy.forGateway(Uri.parse('https://localhost'), pinHost: 'localhost', pins: '$_wrongPin,$_backupPin');
      expect(q.accepts('localhost', _certDer()), isFalse);
    });
  });

  test('spkiPin matches openssl for the fixture certificate', () {
    expect(spkiPin(_certDer()), _goodPin);
    expect(() => spkiPin(Uint8List(0)), throwsA(isA<DerFormatException>()));
  });

  group('pinnedClient against a real local TLS server', () {
    late HttpServer server;
    late SecurityContext trust;

    setUp(() async {
      final serverCtx = SecurityContext()
        ..useCertificateChain('test/security/fixtures/server.pem')
        ..usePrivateKey('test/security/fixtures/server.key');
      server = await HttpServer.bindSecure('127.0.0.1', 0, serverCtx);
      server.listen((r) {
        r.response.write('ok');
        r.response.close();
      });
      trust = SecurityContext(withTrustedRoots: false)
        ..setTrustedCertificates('test/security/fixtures/ca.pem');
    });
    tearDown(() => server.close(force: true));

    // The fixture is issued for 127.0.0.1 and localhost.
    Uri url() => Uri.parse('https://127.0.0.1:${server.port}/');

    test('right pin: request goes through', () async {
      final policy = PinPolicy.forGateway(Uri.parse('https://127.0.0.1'),
          pinHost: '127.0.0.1', pins: '$_goodPin,$_backupPin');
      final c = pinnedClient(policy, context: trust);
      expect((await c.get(url())).body, 'ok');
    });

    test('wrong pin: refused (fail closed)', () async {
      final policy = PinPolicy.forGateway(Uri.parse('https://127.0.0.1'),
          pinHost: '127.0.0.1', pins: '$_wrongPin,$_backupPin');
      final c = pinnedClient(policy, context: trust);
      await expectLater(c.get(url()), throwsA(anything));
    });

    test('pinning off: normal TLS validation still applies', () async {
      final c = pinnedClient(const PinPolicy.off(), context: trust);
      expect((await c.get(url())).body, 'ok');
      final untrusting = pinnedClient(const PinPolicy.off(), context: SecurityContext(withTrustedRoots: false));
      await expectLater(untrusting.get(url()), throwsA(anything));
    });
  });

  test('attestation default is a no-op that adds no header', () async {
    expect(await attestationHeaders(const NoopAttestation(), 'nonce'), isEmpty);
  });
}
