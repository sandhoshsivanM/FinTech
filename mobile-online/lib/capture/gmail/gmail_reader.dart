// Reads bank/UPI alert emails from the user's own mailbox, on the device, with
// the user's own OAuth token. Each message is fetched, turned to text, parsed
// and dropped. Only parsed values reach the sink. No email body is stored,
// logged or sent to Khazana's servers.
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../capture_draft.dart';
import '../capture_ingestor.dart';
import '../secret_store.dart';
import 'gmail_auth.dart';
import 'gmail_query.dart';
import 'gmail_text.dart';

class GmailScanResult {
  const GmailScanResult({this.scanned = 0, this.added = 0, this.duplicates = 0, this.ignored = 0});
  final int scanned;
  final int added;
  final int duplicates;
  final int ignored;
}

class GmailReader {
  GmailReader({
    required this.auth,
    required this.ingestor,
    required this.store,
    http.Client? client,
    this.senders = defaultAlertSenders,
    DateTime Function()? clock,
  })  : _http = client ?? http.Client(),
        _clock = clock ?? DateTime.now;

  final GmailAuth auth;
  final CaptureIngestor ingestor;
  final SecretStore store;
  final List<String> senders;
  final http.Client _http;
  final DateTime Function() _clock;

  static const _sinceKey = 'khazana_online.gmail_last_scan';
  static const _api = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';

  /// First scan looks back this far; later scans resume from the last one.
  static const firstScanDays = 30;
  static const maxMessages = 100;

  /// A day of overlap so a late-arriving alert is not missed; the sink's
  /// fingerprint dedupe absorbs the repeats.
  static const overlap = Duration(days: 1);

  Future<GmailScanResult> scan() async {
    final started = _clock();
    final stored = DateTime.tryParse(await store.read(_sinceKey) ?? '');
    final after = stored != null ? stored.subtract(overlap) : started.subtract(const Duration(days: firstScanDays));
    final query = buildAlertQuery(after: after, senders: senders);

    final ids = await _listIds(query);
    var added = 0, dup = 0, ignored = 0;
    for (final id in ids) {
      final payload = await _getPayload(id);
      if (payload == null) {
        ignored++;
        continue;
      }
      final from = headerValue(payload, 'From');
      final outcome = await ingestor.ingest(payloadText(payload), DraftSource.gmail, sender: from);
      switch (outcome) {
        case IngestOutcome.added:
          added++;
        case IngestOutcome.duplicate:
          dup++;
        case IngestOutcome.ignored:
          ignored++;
      }
    }
    await store.write(_sinceKey, started.toUtc().toIso8601String());
    return GmailScanResult(scanned: ids.length, added: added, duplicates: dup, ignored: ignored);
  }

  Future<List<String>> _listIds(String query) async {
    final uri = Uri.parse(_api).replace(queryParameters: {
      'q': query,
      'maxResults': '$maxMessages',
      'fields': 'messages/id',
    });
    final body = await _get(uri);
    final msgs = body['messages'];
    if (msgs is! List) return [];
    return [for (final m in msgs) if (m is Map && m['id'] is String) m['id'] as String];
  }

  Future<Map<String, dynamic>?> _getPayload(String id) async {
    // Only the payload: headers, MIME tree and body data. No labels, no thread.
    final uri = Uri.parse('$_api/${Uri.encodeComponent(id)}').replace(queryParameters: {
      'format': 'full',
      'fields': 'payload',
    });
    final body = await _get(uri);
    final p = body['payload'];
    return p is Map<String, dynamic> ? p : null;
  }

  Future<Map<String, dynamic>> _get(Uri uri) async {
    var token = await auth.accessToken();
    var res = await _http.get(uri, headers: {'Authorization': 'Bearer $token'});
    if (res.statusCode == 401) {
      token = await auth.accessToken(forceRefresh: true);
      res = await _http.get(uri, headers: {'Authorization': 'Bearer $token'});
    }
    if (res.statusCode == 401 || res.statusCode == 403) {
      throw GmailAuthException('Gmail refused access (${res.statusCode}). Reconnect Gmail.');
    }
    if (res.statusCode != 200) throw GmailAuthException('Gmail request failed (${res.statusCode}).');
    final decoded = jsonDecode(res.body);
    return decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
  }
}
