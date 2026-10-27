// What signs DPoP proofs. The signer may hold a hardware key that can never be
// read out (Secure Enclave, StrongBox, TEE) or, only where the platform has no
// hardware support, a software key. Callers see only this interface, so a
// proof never needs the private scalar in Dart memory.
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:pointycastle/export.dart';

import '../core/dpop.dart';

/// Where the private key lives. Anything but [hardware] is weaker and is shown
/// as such (diagnostics, and server-side policy once attestation lands).
enum KeyProtection {
  /// Dedicated secure chip: StrongBox or Secure Enclave. Non-exportable.
  hardware,

  /// Android TEE-backed Keystore. Non-exportable, but not a separate chip.
  trustedEnvironment,

  /// A software key kept in the platform keystore and loaded into memory to
  /// sign. FALLBACK ONLY (no hardware support, or a pre-migration key).
  software,
}

abstract class DeviceSigner {
  KeyProtection get protection;

  /// The public key as a P-256 JWK ({kty, crv, x, y}).
  Map<String, String> get jwk;

  /// ES256 over [message]: raw r||s, 64 bytes.
  Future<Uint8List> sign(Uint8List message);

  /// RFC 7638 thumbprint: what the server puts in the token's cnf.jkt.
  String get thumbprint {
    final j = jwk;
    final canonical = '{"crv":"${j['crv']}","kty":"${j['kty']}","x":"${j['x']}","y":"${j['y']}"}';
    return base64UrlNoPad(SHA256Digest().process(Uint8List.fromList(utf8.encode(canonical))));
  }
}

class SoftwareDeviceSigner extends DeviceSigner {
  SoftwareDeviceSigner(this.key);
  final DeviceKey key;

  @override
  KeyProtection get protection => KeyProtection.software;
  @override
  Map<String, String> get jwk => key.jwk;
  @override
  Future<Uint8List> sign(Uint8List message) async => key.signRaw(message);
}

/// Builds a DPoP proof (RFC 9449) with any [DeviceSigner]. Same claims as
/// [DeviceKey.proof]; the signature comes from the (possibly hardware) signer.
Future<String> buildDpopProof(
  DeviceSigner signer,
  String method,
  Uri url, {
  String? accessToken,
  DateTime? now,
  String? jti,
}) async {
  String part(Object value) => base64UrlNoPad(utf8.encode(jsonEncode(value)));
  final header = {'typ': 'dpop+jwt', 'alg': 'ES256', 'jwk': signer.jwk};
  final payload = <String, Object>{
    'jti': jti ?? _jti(),
    'htm': method.toUpperCase(),
    'htu': '${url.scheme}://${url.authority}${url.path}',
    'iat': (now ?? DateTime.now()).millisecondsSinceEpoch ~/ 1000,
    if (accessToken != null)
      'ath': base64UrlNoPad(SHA256Digest().process(Uint8List.fromList(ascii.encode(accessToken)))),
  };
  final input = '${part(header)}.${part(payload)}';
  final sig = await signer.sign(Uint8List.fromList(ascii.encode(input)));
  if (sig.length != 64) throw StateError('signer returned a malformed ES256 signature');
  return '$input.${base64UrlNoPad(sig)}';
}

String _jti() {
  final r = Random.secure();
  return base64UrlNoPad(List.generate(16, (_) => r.nextInt(256)));
}

/// Gives the gateway client its signer. The default (software) keeps today's
/// behaviour; the hardened one is in device_key_provider.dart.
abstract class DeviceSignerProvider {
  Future<DeviceSigner> signer();

  /// Called before a brand-new sign-in/pairing (no live session): the moment a
  /// legacy software key can be replaced by a hardware key.
  Future<void> prepareForNewSession() async {}
}
