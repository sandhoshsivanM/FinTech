import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:khazana_online/core/gateway_client.dart';
import 'package:khazana_online/core/google_auth.dart';
import 'package:khazana_online/core/key_store.dart';
import 'package:khazana_online/core/passkey.dart';
import 'package:khazana_online/core/dpop.dart';
import 'package:khazana_online/security/device_signer.dart';

const _tokens = {
  'access_token': 'a', 'token_type': 'DPoP', 'expires_in': 900, 'refresh_token': 'r', 'user_id': 'u1', 'device_id': 'd1',
};

class FakePasskeys implements PasskeyCeremony {
  Json? created, got;
  bool cancel = false;
  @override
  Future<Json> create(Json options) async {
    if (cancel) throw PasskeyCancelled();
    created = options;
    return {'id': 'cred', 'type': 'public-key'};
  }

  @override
  Future<Json> get(Json options) async {
    got = options;
    return {'id': 'cred', 'response': {'signature': 's'}};
  }
}

class FakeGoogle implements GoogleIdTokens {
  String? nonceSeen;
  @override
  Future<String> idToken(String nonce) async {
    nonceSeen = nonce;
    return 'google-id-token';
  }
}

void main() {
  group('with hardening', hardenedSignInTests);
  late List<http.Request> seen;
  late MemoryKeyStore store;
  late FakePasskeys passkeys;
  late FakeGoogle google;
  late GatewayClient client;

  setUp(() {
    seen = [];
    store = MemoryKeyStore();
    passkeys = FakePasskeys();
    google = FakeGoogle();
    client = GatewayClient(
      baseUrl: Uri.parse('http://gw.test'),
      platform: 'ios',
      store: store,
      passkeys: passkeys,
      google: google,
      client: MockClient((r) async {
        seen.add(r);
        if (r.url.path.contains('/options')) {
          return http.Response(jsonEncode({'challenge_id': 'c1', 'options': {'challenge': 'abc', 'rp': {'id': 'khazana.test'}}}), 200);
        }
        return http.Response(jsonEncode(_tokens), 200);
      }),
    );
  });

  test('passkey sign-up: options, platform ceremony, then a token request carrying the attestation', () async {
    await client.signUpWithPasskey();
    expect(seen.map((r) => r.url.path), ['/v1/auth/passkeys/signup/options', '/v1/auth/token']);
    expect(passkeys.created!['challenge'], 'abc');
    expect(jsonDecode(seen.last.body), {
      'platform': 'ios',
      'provider': 'passkey_signup',
      'challenge_id': 'c1',
      'attestation': {'id': 'cred', 'type': 'public-key'},
    });
    // Both calls are signed by this device's DPoP key, the one the token is bound to.
    expect(seen.every((r) => r.headers['DPoP']!.split('.').length == 3), isTrue);
    expect(store.session!.refreshToken, 'r');
  });

  test('passkey sign-in sends the assertion', () async {
    await client.signInWithPasskey();
    expect(seen.map((r) => r.url.path), ['/v1/auth/passkeys/assert/options', '/v1/auth/token']);
    final body = jsonDecode(seen.last.body) as Map<String, dynamic>;
    expect(body['provider'], 'passkey');
    expect(body['assertion'], isNotNull);
  });

  test('a closed passkey prompt sends no token request and keeps no session', () async {
    passkeys.cancel = true;
    await expectLater(client.signUpWithPasskey(), throwsA(isA<PasskeyCancelled>()));
    expect(seen.map((r) => r.url.path), ['/v1/auth/passkeys/signup/options']);
    expect(store.session, isNull);
  });

  test('Google sign-in: the ID token is minted with this device\'s DPoP thumbprint as its nonce', () async {
    await client.signInWithGoogle();
    final thumbprint = await client.dpopThumbprint();
    expect(google.nonceSeen, thumbprint);
    expect(thumbprint, hasLength(43));
    expect(jsonDecode(seen.single.body), {'platform': 'ios', 'provider': 'google', 'id_token': 'google-id-token'});
    // The proof on that request is signed by the key the nonce names.
    final header = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(seen.single.headers['DPoP']!.split('.')[0])))) as Map<String, dynamic>;
    expect(header['jwk']['kty'], 'EC');
  });

  test('a build without passkeys or Google says so instead of crashing', () async {
    final bare = GatewayClient(baseUrl: Uri.parse('http://gw.test'), platform: 'ios', store: MemoryKeyStore());
    await expectLater(bare.signInWithPasskey(), throwsStateError);
    await expectLater(bare.signInWithGoogle(), throwsStateError);
  });
}

/// Hands out one key before a new session is prepared and another after — the
/// software-to-hardware swap the hardened provider makes.
class _SwappingSigners extends DeviceSignerProvider {
  _SwappingSigners() : _current = SoftwareDeviceSigner(DeviceKey.generate());
  DeviceSigner _current;
  int prepared = 0;
  @override
  Future<DeviceSigner> signer() async => _current;
  @override
  Future<void> prepareForNewSession() async {
    prepared++;
    _current = SoftwareDeviceSigner(DeviceKey.generate());
  }
}

void hardenedSignInTests() {
  late List<http.Request> seen;
  late _SwappingSigners signers;
  late FakeGoogle google;
  late GatewayClient client;

  setUp(() {
    seen = [];
    signers = _SwappingSigners();
    google = FakeGoogle();
    client = GatewayClient(
      baseUrl: Uri.parse('http://gw.test'),
      platform: 'android',
      store: MemoryKeyStore(),
      passkeys: FakePasskeys(),
      google: google,
      signers: signers,
      client: MockClient((r) async {
        seen.add(r);
        if (r.url.path.contains('/options')) {
          return http.Response(jsonEncode({'challenge_id': 'c1', 'options': {'challenge': 'abc'}}), 200);
        }
        return http.Response(jsonEncode(_tokens), 200);
      }),
    );
  });

  // Every new session binds to the key that will sign later requests: the
  // hardware key, minted by prepareForNewSession before anything is signed.
  test('passkey sign-up and sign-in prepare the session key first', () async {
    await client.signUpWithPasskey();
    await client.signInWithPasskey();
    expect(signers.prepared, 2);
  });

  test('Google nonce is the thumbprint of the key that signs, prepared first', () async {
    await client.signInWithGoogle();
    expect(signers.prepared, 1);
    expect(google.nonceSeen, (await signers.signer()).thumbprint);
  });
}
