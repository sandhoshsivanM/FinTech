import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:khazana_online/core/gateway_client.dart';
import 'package:khazana_online/core/key_store.dart';

Map<String, dynamic> _tokens(int n) => {
      'access_token': 'access-$n', 'token_type': 'DPoP', 'expires_in': 900,
      'refresh_token': 'refresh-$n', 'user_id': 'u1', 'device_id': 'd1',
    };

class _Harness {
  _Harness(List<http.Response Function(http.Request)> responses) {
    client = GatewayClient(
      baseUrl: Uri.parse('http://gw.test'),
      platform: 'android',
      store: store,
      client: MockClient((r) async {
        seen.add(r);
        if (responses.isEmpty) throw StateError('unexpected ${r.method} ${r.url}');
        return responses.removeAt(0)(r);
      }),
      now: () => now,
    );
  }
  final seen = <http.Request>[];
  final store = MemoryKeyStore();
  DateTime now = DateTime.utc(2026, 10, 22);
  late final GatewayClient client;
}

http.Response Function(http.Request) _json(Object body, [int status = 200]) =>
    (_) => http.Response(jsonEncode(body), status);

void main() {
  test('sign-in sends a DPoP proof and no Authorization, with the platform, and keeps the session', () async {
    final h = _Harness([_json(_tokens(1))]);
    await h.client.signIn('dev', 'dev:me');
    final r = h.seen.single;
    expect(r.url.toString(), 'http://gw.test/v1/auth/token');
    expect(r.headers['DPoP']!.split('.'), hasLength(3));
    expect(r.headers.containsKey('Authorization'), isFalse);
    expect(jsonDecode(r.body), {'provider': 'dev', 'platform': 'android', 'id_token': 'dev:me'});
    expect(h.store.session!.refreshToken, 'refresh-1');
    expect(h.store.key, isNotNull);
  });

  test('a signed-in call carries the access token and a proof from the same key', () async {
    final h = _Harness([_json(_tokens(1)), _json({'ok': true})]);
    await h.client.signIn('dev', 'dev:me');
    await h.client.call('GET', '/v1/devices/me');
    String jwk(http.Request r) => utf8.decode(base64Url.decode(base64Url.normalize(r.headers['DPoP']!.split('.')[0])));
    expect(h.seen[1].headers['Authorization'], 'DPoP access-1');
    expect(jwk(h.seen[1]), jwk(h.seen[0]));
  });

  test('an expired access token is refreshed first, rotating the refresh token', () async {
    final h = _Harness([_json(_tokens(1)), _json(_tokens(2)), _json({})]);
    await h.client.signIn('dev', 'dev:me');
    h.now = h.now.add(const Duration(minutes: 15));
    await h.client.call('GET', '/v1/devices/me');
    expect(jsonDecode(h.seen[1].body), {'refresh_token': 'refresh-1'});
    expect(h.seen[2].headers['Authorization'], 'DPoP access-2');
    expect(h.store.session!.refreshToken, 'refresh-2');
  });

  test('a 401 triggers one refresh and one retry', () async {
    final h = _Harness([
      _json(_tokens(1)), _json({'error': 'invalid_token'}, 401), _json(_tokens(2)), _json({'ok': 1}),
    ]);
    await h.client.signIn('dev', 'dev:me');
    expect(await h.client.call('GET', '/v1/devices/me'), {'ok': 1});
    expect(h.seen, hasLength(4));
  });

  test('a refused refresh signs this device out', () async {
    final h = _Harness([_json(_tokens(1)), _json({'error': 'invalid_grant'}, 400)]);
    await h.client.signIn('dev', 'dev:me');
    h.now = h.now.add(const Duration(minutes: 15));
    await expectLater(h.client.call('GET', '/v1/devices/me'),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'invalid_grant')));
    expect(h.store.session, isNull);
  });

  test('the device key survives a restart (same key from the store)', () async {
    final h = _Harness([_json(_tokens(1))]);
    await h.client.signIn('dev', 'dev:me');
    final second = GatewayClient(
      baseUrl: Uri.parse('http://gw.test'), platform: 'android', store: h.store,
      client: MockClient((r) async => http.Response(r.headers['DPoP']!, 200)),
    );
    expect(await second.isSignedIn(), isTrue);
  });
}
