import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:khazana_online/capture/capture_config.dart';
import 'package:khazana_online/capture/capture_sink.dart';
import 'package:khazana_online/capture/gmail/gmail_auth.dart';
import 'package:khazana_online/capture/gmail/gmail_query.dart';
import 'package:khazana_online/capture/gmail/gmail_reader.dart';
import 'package:khazana_online/capture/gmail/gmail_text.dart';
import 'package:khazana_online/capture/secret_store.dart';

import 'helpers.dart';

String b64(String s) => base64Url.encode(utf8.encode(s));

Map<String, dynamic> message(String text, {String from = 'HDFC Bank <alerts@hdfcbank.net>'}) => {
      'payload': {
        'mimeType': 'multipart/alternative',
        'headers': [
          {'name': 'From', 'value': from},
          {'name': 'Subject', 'value': 'Alert'},
        ],
        'parts': [
          {'mimeType': 'text/plain', 'body': {'data': b64(text)}},
        ],
      },
    };

void main() {
  group('query', () {
    test('limits to bank senders and a start time', () {
      final q = buildAlertQuery(after: DateTime.utc(2026, 10, 1), senders: ['hdfcbank.net', 'sbi.co.in']);
      expect(q, '(from:hdfcbank.net OR from:sbi.co.in) after:1790812800');
    });

    test('drops anything that is not a plain domain (no operator injection)', () {
      final q = buildAlertQuery(after: DateTime.utc(2026, 10, 1), senders: ['hdfcbank.net', 'x.com OR in:anywhere', '-label:foo']);
      expect(q, startsWith('(from:hdfcbank.net) after:'));
      expect(() => buildAlertQuery(after: DateTime.utc(2026), senders: ['bad one']), throwsArgumentError);
    });

    test('redirect scheme is the reversed client id', () {
      expect(googleRedirectScheme('123-abc.apps.googleusercontent.com'), 'com.googleusercontent.apps.123-abc');
    });

    test('requests only the read-only scope', () => expect(gmailReadonlyScope, endsWith('/gmail.readonly')));
  });

  group('text', () {
    test('prefers text/plain and decodes base64url', () {
      expect(payloadText(message('Rs. 5 debited')['payload']), 'Rs. 5 debited');
    });
    test('falls back to stripped html', () {
      final p = {
        'mimeType': 'text/html',
        'body': {'data': b64('<style>a{}</style><p>Rs.&nbsp;500 <b>debited</b></p>')},
      };
      expect(payloadText(p), 'Rs. 500 debited');
    });
    test('survives hostile nesting', () {
      Map<String, dynamic> nest(int n) => n == 0 ? {'mimeType': 'x'} : {'parts': [nest(n - 1)]};
      expect(payloadText(nest(200)), '');
    });
  });

  group('reader', () {
    GmailReader build(MockClient client, InMemoryCaptureSink sink, MemorySecretStore store, FakeGmailAuth auth) =>
        GmailReader(auth: auth, ingestor: newIngestor(sink), store: store, client: client, clock: () => fixedNow);

    test('lists by query, fetches payload only, keeps parsed values and saves scan time', () async {
      final urls = <Uri>[];
      final client = MockClient((req) async {
        urls.add(req.url);
        expect(req.headers['Authorization'], 'Bearer stale');
        if (req.url.path.endsWith('/messages')) {
          return http.Response(jsonEncode({'messages': [{'id': 'm1'}, {'id': 'm2'}]}), 200);
        }
        final text = req.url.pathSegments.last == 'm1' ? hdfcDebit : 'Win a prize! click here';
        return http.Response(jsonEncode(message(text)), 200);
      });
      final sink = InMemoryCaptureSink();
      final store = MemorySecretStore();
      final r = await build(client, sink, store, FakeGmailAuth()).scan();

      expect((r.scanned, r.added, r.ignored), (2, 1, 1));
      expect(urls.first.queryParameters['q'], contains('from:hdfcbank.net'));
      expect(urls.first.queryParameters['q'], contains('after:'));
      expect(urls.last.queryParameters['fields'], 'payload');
      expect(urls.last.queryParameters['format'], 'full');
      expect(urls.every((u) => u.host == 'gmail.googleapis.com'), isTrue);
      final d = (await sink.all()).single;
      expect(d.profileId, 'hdfc');
      expect(store.data.values.single, fixedNow.toIso8601String());
    });

    test('the second scan resumes from the saved time with a day of overlap', () async {
      final store = MemorySecretStore()..data['khazana_online.gmail_last_scan'] = DateTime.utc(2026, 10, 20).toIso8601String();
      late Uri listUrl;
      final client = MockClient((req) async {
        listUrl = req.url;
        return http.Response('{}', 200);
      });
      await build(client, InMemoryCaptureSink(), store, FakeGmailAuth()).scan();
      final after = int.parse(RegExp(r'after:(\d+)').firstMatch(listUrl.queryParameters['q']!)!.group(1)!);
      expect(after, DateTime.utc(2026, 10, 19).millisecondsSinceEpoch ~/ 1000);
    });

    test('a 401 refreshes the token once and retries', () async {
      var calls = 0;
      final client = MockClient((req) async {
        calls++;
        if (req.headers['Authorization'] == 'Bearer stale') return http.Response('', 401);
        return http.Response('{}', 200);
      });
      final auth = FakeGmailAuth();
      await build(client, InMemoryCaptureSink(), MemorySecretStore(), auth).scan();
      expect(auth.refreshes, 1);
      expect(calls, 2);
    });

    test('a refused token surfaces as an auth error and does not advance the scan time', () async {
      final client = MockClient((_) async => http.Response('', 403));
      final store = MemorySecretStore();
      await expectLater(build(client, InMemoryCaptureSink(), store, FakeGmailAuth()).scan(), throwsA(isA<GmailAuthException>()));
      expect(store.data, isEmpty);
    });
  });
}
