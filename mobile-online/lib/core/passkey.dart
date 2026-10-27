// WebAuthn ceremonies: the server's JSON options go to the platform passkey
// UI (Face ID / Touch ID / Android Credential Manager) and the standard JSON
// answer comes back, as webapp-online/src/lib/passkey.ts does in a browser.
import 'package:passkeys/authenticator.dart';
import 'package:passkeys/types.dart';

typedef Json = Map<String, dynamic>;

/// What the gateway client needs from the platform; tests replace it.
abstract class PasskeyCeremony {
  /// Creates a passkey. Returns the attestation JSON.
  Future<Json> create(Json options);

  /// Signs in with a passkey. Returns the assertion JSON.
  Future<Json> get(Json options);
}

class PasskeyCancelled implements Exception {
  @override
  String toString() => 'The passkey prompt was closed.';
}

class PlatformPasskeys implements PasskeyCeremony {
  PlatformPasskeys([PasskeyAuthenticator? authenticator]) : _auth = authenticator ?? PasskeyAuthenticator();
  final PasskeyAuthenticator _auth;

  /// The plugin's parser needs `transports` on every credential descriptor.
  static List<dynamic>? _descriptors(Object? list) => (list as List<dynamic>?)
      ?.map((d) => <String, dynamic>{...(d as Map<String, dynamic>), 'transports': (d['transports'] as List?) ?? const <String>[]})
      .toList();

  @override
  Future<Json> create(Json options) async {
    final o = <String, dynamic>{...options, 'excludeCredentials': _descriptors(options['excludeCredentials'])};
    try {
      return (await _auth.register(RegisterRequestType.fromJson(o))).toJson();
    } on PasskeyAuthCancelledException {
      throw PasskeyCancelled();
    }
  }

  @override
  Future<Json> get(Json options) async {
    final o = <String, dynamic>{...options, 'allowCredentials': _descriptors(options['allowCredentials'])};
    try {
      return (await _auth.authenticate(AuthenticateRequestType.fromJson(o, mediation: MediationType.Optional, preferImmediatelyAvailableCredentials: false)))
          .toJson();
    } on PasskeyAuthCancelledException {
      throw PasskeyCancelled();
    }
  }
}
