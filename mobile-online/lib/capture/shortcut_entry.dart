// Dart side of the iOS "Add bank SMS to Khazana" App Intent.
//
// The Swift intent starts a headless Flutter engine at [captureIntentMain],
// keeps the message text in memory only, and waits. This entry pulls the text
// over a method channel, parses it with the shared parser, stores the parsed
// values, and replies with a one-word outcome. The text is never written to
// disk or logged, on either side.
import 'package:flutter/widgets.dart';
import 'package:flutter/services.dart';

import 'capture_draft.dart';
import 'capture_ingestor.dart';
import 'capture_sink.dart';

const shortcutChannelName = 'khazana_online/capture_intent';

/// 'added' | 'duplicate' | 'ignored' | 'error'
Future<String> handleShortcutText(String? text, CaptureIngestor ingestor, {String? sender}) async {
  if (text == null || text.trim().isEmpty) return 'ignored';
  try {
    final outcome = await ingestor.ingest(text, DraftSource.shortcut, sender: sender);
    return outcome.name;
  } catch (_) {
    return 'error';
  }
}

@pragma('vm:entry-point')
Future<void> captureIntentMain() async {
  WidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel(shortcutChannelName);
  var result = 'error';
  try {
    final req = await channel.invokeMapMethod<String, String>('take');
    result = await handleShortcutText(req?['text'], CaptureIngestor(sink: SecureCaptureSink()), sender: req?['sender']);
  } catch (_) {
    result = 'error';
  }
  await channel.invokeMethod<void>('done', {'result': result});
}
