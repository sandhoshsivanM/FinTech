// App attestation hooks (design doc §14: Play Integrity / App Attest). The
// server decides whether a client is the genuine app; this is the client half.
//
// NOT ACTIVE: the default is [NoopAttestation]. Turning it on needs accounts
// and keys we do not have yet (Google Cloud project for Play Integrity, Apple
// developer team for App Attest), so none of that is set up here.
//
// TODO(server): Identity/Gateway must verify the token and bind it to the
// request: Play Integrity verdict decoded server-side (deviceIntegrity,
// appIntegrity, licensing) with the nonce below; App Attest attestation object
// verified against Apple's root, and assertions checked per request with a
// counter. Until then NOTHING trusts this header.
class AttestationToken {
  const AttestationToken({required this.kind, required this.value});

  /// 'play-integrity' or 'app-attest'.
  final String kind;
  final String value;
}

abstract class AppAttestation {
  /// [challenge] is a server-issued single-use nonce (hash it into the request
  /// so a verdict cannot be replayed). Returns null when unsupported/disabled.
  Future<AttestationToken?> attest(String challenge);
}

class NoopAttestation implements AppAttestation {
  const NoopAttestation();
  @override
  Future<AttestationToken?> attest(String challenge) async => null;
}

/// Header carrying the token, for the gateway client to add once the server
/// verifies it. Empty map with the no-op default.
Future<Map<String, String>> attestationHeaders(AppAttestation attestation, String challenge) async {
  final t = await attestation.attest(challenge);
  return t == null ? const {} : {'X-Khazana-Attestation': '${t.kind}:${t.value}'};
}

// TODO(android): implement PlayIntegrityAttestation over a platform channel
// (IntegrityManager.requestIntegrityToken(nonce)); TODO(ios): AppAttestAttestation
// (DCAppAttestService.generateKey / attestKey / generateAssertion).
