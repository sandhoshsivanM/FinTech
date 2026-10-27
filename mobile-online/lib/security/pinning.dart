// Certificate pinning for the gateway: the SHA-256 of the server certificate's
// SubjectPublicKeyInfo (the "pin", base64) must be in a configured set. The set
// must hold at least two pins (the live key and a backup generated offline), so
// a key rotation cannot lock every installed app out.
//
// Config-driven, per host:
//   * no pin host configured, or the gateway is another host (sslip.io demo
//     domains, tunnels): pinning is OFF, and [PinPolicy.enforced] says so;
//   * the gateway is the configured production host: pinning is ON and FAILS
//     CLOSED: a wrong pin, an unparsable certificate, or a misconfigured pin
//     set (fewer than two, malformed) refuses the connection.
// Normal chain validation always runs first; pinning only adds to it.
//
// Limitation: dart:io exposes only the LEAF certificate, so we pin the leaf's
// SPKI (reuse the same key across renewals; keep the backup key offline).
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';
import 'package:pointycastle/export.dart';

import 'ecdsa_der.dart';

class PinConfigException implements Exception {
  PinConfigException(this.message);
  final String message;
  @override
  String toString() => 'PinConfigException: $message';
}

class PinPolicy {
  const PinPolicy._(this.host, this.pins);

  /// Pinning off (demo / local).
  const PinPolicy.off() : this._(null, const {});

  final String? host;
  final Set<String> pins;
  bool get enforced => host != null;

  /// [pinHost] / [pins] come from build defines (KHAZANA_PIN_HOST,
  /// KHAZANA_PINS="a=,b="). Throws [PinConfigException] on a bad config rather
  /// than silently running unpinned.
  static PinPolicy forGateway(Uri gateway, {required String pinHost, required String pins}) {
    if (pinHost.isEmpty) return const PinPolicy.off();
    if (gateway.host.toLowerCase() != pinHost.toLowerCase()) return const PinPolicy.off();
    if (gateway.scheme != 'https') throw PinConfigException('pinned host must use https');
    final set = pins.split(',').map((p) => p.trim()).where((p) => p.isNotEmpty).toSet();
    if (set.length < 2) throw PinConfigException('pinning needs at least two pins (live + backup)');
    for (final p in set) {
      try {
        if (base64.decode(p).length != 32) throw const FormatException();
      } on FormatException {
        throw PinConfigException('pin is not a base64 SHA-256: $p');
      }
    }
    return PinPolicy._(pinHost.toLowerCase(), set);
  }

  /// Whether a certificate presented by [host] is acceptable.
  bool accepts(String host, Uint8List certificateDer) {
    if (!enforced || host.toLowerCase() != this.host) return true;
    try {
      return pins.contains(spkiPin(certificateDer));
    } on DerFormatException {
      return false; // fail closed
    }
  }
}

/// Base64 SHA-256 of the certificate's SubjectPublicKeyInfo DER.
String spkiPin(Uint8List certDer) {
  final cert = readTlv(certDer, 0);
  if (cert.tag != 0x30) throw DerFormatException('certificate is not a SEQUENCE');
  final tbs = readTlv(certDer, cert.start);
  if (tbs.tag != 0x30) throw DerFormatException('tbsCertificate is not a SEQUENCE');
  var pos = tbs.start;
  var field = readTlv(certDer, pos);
  if (field.tag == 0xA0) {
    // optional [0] version
    pos = field.end;
    field = readTlv(certDer, pos);
  }
  // serialNumber, signature, issuer, validity, subject, then SPKI.
  for (var i = 0; i < 5; i++) {
    pos = field.end;
    field = readTlv(certDer, pos);
  }
  if (field.tag != 0x30) throw DerFormatException('SPKI is not a SEQUENCE');
  final spki = Uint8List.sublistView(certDer, pos, field.end);
  return base64.encode(SHA256Digest().process(spki));
}

/// An HTTP client that pins [policy] on top of normal TLS validation.
/// [context] is for tests (to trust a fixture CA); production uses the
/// platform trust store.
http.Client pinnedClient(PinPolicy policy, {SecurityContext? context}) {
  final inner = HttpClient(context: context);
  if (policy.enforced) {
    inner.connectionFactory = (uri, proxyHost, proxyPort) async {
      if (uri.scheme != 'https') throw const SocketException('pinned client refuses non-https');
      final host = uri.host;
      final task = await SecureSocket.startConnect(
        proxyHost ?? host,
        proxyPort ?? uri.port,
        context: context,
        onBadCertificate: (_) => false, // never bypass chain validation
      );
      final checked = task.socket.then<Socket>((s) {
        final cert = s.peerCertificate;
        if (cert == null || !policy.accepts(host, cert.der)) {
          s.destroy();
          throw HandshakeException('certificate pin mismatch for $host');
        }
        return s;
      });
      return ConnectionTask.fromSocket(checked, task.cancel);
    };
  }
  return IOClient(inner);
}
