// Turns a Gmail API message payload into plain text for the parser. The text
// lives only in memory for the length of one parse.
import 'dart:convert';

/// Plain text of a message payload (the `payload` object of messages.get).
/// Prefers text/plain; falls back to stripped text/html.
String payloadText(Map<String, dynamic> payload) {
  final plain = <String>[];
  final html = <String>[];
  void walk(Map<String, dynamic> part, int depth) {
    if (depth > 8) return; // hostile nesting
    final mime = '${part['mimeType'] ?? ''}'.toLowerCase();
    final data = (part['body'] is Map) ? (part['body'] as Map)['data'] : null;
    if (data is String && data.isNotEmpty) {
      final text = _decode(data);
      if (mime == 'text/plain') plain.add(text);
      if (mime == 'text/html') html.add(text);
    }
    final parts = part['parts'];
    if (parts is List) {
      for (final p in parts) {
        if (p is Map<String, dynamic>) walk(p, depth + 1);
      }
    }
  }

  walk(payload, 0);
  if (plain.isNotEmpty) return plain.join('\n');
  return html.map(stripHtml).join('\n');
}

String? headerValue(Map<String, dynamic> payload, String name) {
  final headers = payload['headers'];
  if (headers is! List) return null;
  for (final h in headers) {
    if (h is Map && '${h['name']}'.toLowerCase() == name.toLowerCase()) return '${h['value']}';
  }
  return null;
}

String _decode(String b64url) {
  try {
    return utf8.decode(base64Url.decode(base64Url.normalize(b64url)), allowMalformed: true);
  } catch (_) {
    return '';
  }
}

String stripHtml(String html) {
  var t = html
      .replaceAll(RegExp(r'<(script|style)[^>]*>.*?</\1>', dotAll: true, caseSensitive: false), ' ')
      .replaceAll(RegExp(r'<[^>]*>'), ' ');
  const entities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#8377;': '₹',
    '&#x20b9;': '₹',
  };
  entities.forEach((k, v) => t = t.replaceAll(RegExp(k, caseSensitive: false), v));
  return t.replaceAll(RegExp(r'\s+'), ' ').trim();
}
