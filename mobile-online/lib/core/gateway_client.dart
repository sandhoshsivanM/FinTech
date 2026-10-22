// The gateway client. Every request is DPoP-signed with this device's key; the
// access token is kept in memory and refreshed (rotating the refresh token)
// when it expires or the server refuses it. Mirrors webapp-online/src/lib/api.ts.
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'dpop.dart';
import 'key_store.dart';

class ApiException implements Exception {
  ApiException(this.status, this.code);
  final int status;
  final String? code;
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

class GatewayClient {
  GatewayClient({
    required this.baseUrl,
    required this.platform,
    required KeyStore store,
    http.Client? client,
    DateTime Function()? now,
  })  : _store = store,
        _http = client ?? http.Client(),
        _now = now ?? DateTime.now;

  final Uri baseUrl;

  /// One of the platforms Identity accepts: android, ios, macos.
  final String platform;
  final KeyStore _store;
  final http.Client _http;
  final DateTime Function() _now;

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
    final request = http.Request(method, url)
      ..headers['DPoP'] = (await _deviceKey()).proof(method, url, accessToken: accessToken, now: _now());
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
    throw ApiException(response.statusCode, code);
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
    final response =
        await _send('POST', '/v1/auth/token', {'provider': provider, 'platform': platform, 'id_token': idToken});
    if (response.statusCode != 200) _fail(response);
    return _keep(response);
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
