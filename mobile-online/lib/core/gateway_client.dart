// The gateway client. Every request is DPoP-signed with this device's key; the
// access token is kept in memory and refreshed (rotating the refresh token)
// when it expires or the server refuses it. Mirrors webapp-online/src/lib/api.ts.
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../keys/account_keys.dart' show Api;
import 'dpop.dart';
import 'google_auth.dart';
import 'key_store.dart';
import '../security/device_signer.dart';
import 'passkey.dart';

class ApiException implements Exception {
  ApiException(this.status, this.code, [this.retryAfter]);
  final int status;
  final String? code;

  /// Seconds the server asked us to wait (429).
  final int? retryAfter;
  @override
  String toString() => 'ApiException($status${code == null ? '' : ' $code'})';
}

class TokenResponse {
  TokenResponse.fromJson(Map<String, dynamic> j)
      : accessToken = j['access_token'] as String,
        expiresIn = j['expires_in'] as int,
        refreshToken = j['refresh_token'] as String,
        userId = j['user_id'] as String,
        deviceId = j['device_id'] as String;
  final String accessToken;
  final int expiresIn;
  final String refreshToken;
  final String userId;
  final String deviceId;
}

/// What asking for an SMS code returns. [demoCode] appears only on a demo
/// server that shows the code instead of texting it.
class PhoneChallenge {
  PhoneChallenge.fromJson(Map<String, dynamic> j)
      : challengeId = j['challenge_id'] as String,
        expiresIn = j['expires_in'] as int,
        resendAfter = j['resend_after'] as int,
        demoCode = j['demo_code'] as String?;
  final String challengeId;
  final int expiresIn;
  final int resendAfter;
  final String? demoCode;
}

class GatewayClient implements Api {
  GatewayClient({
    required this.baseUrl,
    required this.platform,
    required KeyStore store,
    http.Client? client,
    DateTime Function()? now,
    DeviceSignerProvider? signers,
    PasskeyCeremony? passkeys,
    GoogleIdTokens? google,
  })  : _store = store,
        _signers = signers,
        _passkeys = passkeys,
        _google = google,
        _http = client ?? http.Client(),
        _now = now ?? DateTime.now;

  final Uri baseUrl;

  /// One of the platforms Identity accepts: android, ios, macos.
  final String platform;
  final KeyStore _store;
  final PasskeyCeremony? _passkeys;
  final GoogleIdTokens? _google;
  final http.Client _http;
  final DateTime Function() _now;

  /// Hardware-aware signer source; null keeps the software key (tests, tools).
  final DeviceSignerProvider? _signers;
  DeviceKey? _key;
  ({String token, DateTime expiresAt})? _access;

  Future<DeviceKey> _deviceKey() async {
    if (_key != null) return _key!;
    final stored = await _store.readKey();
    if (stored != null) return _key = DeviceKey.restore(stored);
    final key = DeviceKey.generate();
    await _store.writeKey(key.export());
    return _key = key;
  }

  Future<http.Response> _send(String method, String path, Object? body, [String? accessToken]) async {
    final url = baseUrl.resolve(path);
    final signers = _signers;
    final proof = signers != null
        ? await buildDpopProof(await signers.signer(), method, url, accessToken: accessToken, now: _now())
        : (await _deviceKey()).proof(method, url, accessToken: accessToken, now: _now());
    final request = http.Request(method, url)..headers['DPoP'] = proof;
    if (accessToken != null) request.headers['Authorization'] = 'DPoP $accessToken';
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    return http.Response.fromStream(await _http.send(request));
  }

  static Never _fail(http.Response response) {
    String? code;
    try {
      final body = jsonDecode(response.body);
      if (body is Map && body['error'] is String) code = body['error'] as String;
    } on FormatException {
      // Not JSON: the status alone says enough.
    }
    final wait = int.tryParse(response.headers['retry-after'] ?? '');
    throw ApiException(response.statusCode, code, wait != null && wait > 0 ? wait : null);
  }

  Future<TokenResponse> _keep(http.Response response) async {
    final tokens = TokenResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
    _access = (token: tokens.accessToken, expiresAt: _now().add(Duration(seconds: tokens.expiresIn)));
    await _store.writeSession(
        Session(refreshToken: tokens.refreshToken, userId: tokens.userId, deviceId: tokens.deviceId));
    return tokens;
  }

  /// Signs in with a provider's ID token (`dev` is the development provider).
  Future<TokenResponse> signIn(String provider, String idToken) async {
    await _signers?.prepareForNewSession();
    final response =
        await _send('POST', '/v1/auth/token', {'provider': provider, 'platform': platform, 'id_token': idToken});
    if (response.statusCode != 200) _fail(response);
    return _keep(response);
  }

  Future<TokenResponse> _tokenWith(Map<String, Object?> body) async {
    final response = await _send('POST', '/v1/auth/token', {'platform': platform, ...body});
    if (response.statusCode != 200) _fail(response);
    return _keep(response);
  }

  Future<({String challengeId, Map<String, dynamic> options})> _challenge(String path) async {
    final response = await _send('POST', path, null);
    if (response.statusCode != 200) _fail(response);
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (challengeId: body['challenge_id'] as String, options: body['options'] as Map<String, dynamic>);
  }

  PasskeyCeremony get _ceremony => _passkeys ?? (throw StateError('Passkeys are not available in this build.'));

  /// Creates an account with a new passkey (Face ID / fingerprint / PIN) and signs in.
  Future<TokenResponse> signUpWithPasskey() async {
    final ceremony = _ceremony; // fail before any request if this build has no passkeys
    await _signers?.prepareForNewSession();
    final c = await _challenge('/v1/auth/passkeys/signup/options');
    final attestation = await ceremony.create(c.options);
    return _tokenWith({'provider': 'passkey_signup', 'challenge_id': c.challengeId, 'attestation': attestation});
  }

  /// Signs in with a passkey already on this device.
  Future<TokenResponse> signInWithPasskey() async {
    final ceremony = _ceremony;
    await _signers?.prepareForNewSession();
    final c = await _challenge('/v1/auth/passkeys/assert/options');
    final assertion = await ceremony.get(c.options);
    return _tokenWith({'provider': 'passkey', 'challenge_id': c.challengeId, 'assertion': assertion});
  }

  /// Whether this build can create passkeys (so adding one can be offered).
  bool get passkeysAvailable => _passkeys != null;

  /// Texts a 6-digit code to a mobile number (+91 only for now). The answer is
  /// the same whether or not the number has an account.
  ///
  /// The session key is chosen here, once: [signInWithPhone] must be signed by
  /// the same key, because the server binds the code to it.
  Future<PhoneChallenge> startPhoneSignIn(String phone) async {
    await _signers?.prepareForNewSession();
    final response = await _send('POST', '/v1/auth/phone/start', {'phone': phone, 'platform': platform});
    if (response.statusCode != 200) _fail(response);
    return PhoneChallenge.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  /// Signs in (or creates the account) with the code that was texted. Five wrong tries burn the code.
  Future<TokenResponse> signInWithPhone(String challengeId, String code) =>
      _tokenWith({'provider': 'phone', 'challenge_id': challengeId, 'code': code});

  /// Adds a passkey to the signed-in account. The server allows it only within
  /// a few minutes of signing in.
  Future<void> addPasskey() async {
    final ceremony = _ceremony;
    final options = await call('POST', '/v1/auth/passkeys/register/options') as Map<String, dynamic>;
    final attestation = await ceremony.create(options['options'] as Map<String, dynamic>);
    await call('POST', '/v1/auth/passkeys/register', {'challenge_id': options['challenge_id'], 'attestation': attestation});
  }

  /// This device's DPoP key thumbprint (RFC 7638): the nonce Google's ID token must carry.
  /// The key that signs requests: the hardware key when hardening provides one.
  Future<String> dpopThumbprint() async {
    final signers = _signers;
    return signers != null ? (await signers.signer()).thumbprint : (await _deviceKey()).thumbprint;
  }

  /// Signs in (or creates the account) with a Google ID token minted for this device's key.
  Future<TokenResponse> signInWithGoogle() async {
    final google = _google ?? (throw StateError('Google sign-in is not available in this build.'));
    // Before the thumbprint is read: the session (and the token's nonce) must
    // bind to the key that will sign every later request.
    await _signers?.prepareForNewSession();
    return _tokenWith({'provider': 'google', 'id_token': await google.idToken(await dpopThumbprint())});
  }

  Future<bool> isSignedIn() async => await _store.readSession() != null;

  Future<String> _refresh() async {
    final session = await _store.readSession();
    if (session == null) throw ApiException(401, 'signed_out');
    final response = await _send('POST', '/v1/auth/refresh', {'refresh_token': session.refreshToken});
    if (response.statusCode != 200) {
      // A refused refresh (revoked, reused or expired) ends this session here too.
      _access = null;
      await _store.clearSession();
      _fail(response);
    }
    return (await _keep(response)).accessToken;
  }

  Future<String> _accessToken() async {
    final access = _access;
    // Renew a little early, so a token never expires in flight.
    if (access != null && access.expiresAt.subtract(const Duration(seconds: 30)).isAfter(_now())) {
      return access.token;
    }
    return _refresh();
  }

  /// A signed-in call. One retry after a refresh if the token was refused.
  @override
  Future<Object?> call(String method, String path, [Object? body]) async {
    var response = await _send(method, path, body, await _accessToken());
    if (response.statusCode == 401) {
      _access = null;
      response = await _send(method, path, body, await _refresh());
    }
    if (response.statusCode < 200 || response.statusCode > 299) _fail(response);
    return response.statusCode == 204 || response.body.isEmpty ? null : jsonDecode(response.body);
  }

  Future<void> signOut({bool everywhere = false}) async {
    try {
      await call('POST', '/v1/auth/logout', {'everywhere': everywhere});
    } finally {
      _access = null;
      await _store.clearSession();
    }
  }
}
