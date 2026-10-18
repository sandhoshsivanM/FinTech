import 'capture_channel.dart';
import 'capture_pipeline.dart';

/// Where the last SMS scan stopped. Per vault; a timestamp, not message data.
abstract interface class SmsScanCursor {
  Future<DateTime?> read();
  Future<void> write(DateTime at);
}

class SmsCatchUpResult {
  const SmsCatchUpResult({this.autoPosted = 0, this.queued = 0});
  final int autoPosted;
  final int queued;
  bool get isEmpty => autoPosted == 0 && queued == 0;

  static SmsCatchUpResult from(List<IngestOutcome> outcomes) => SmsCatchUpResult(
        autoPosted: outcomes.where((o) => o.result == IngestResult.autoPosted).length,
        queued: outcomes.where((o) => o.result == IngestResult.queued).length,
      );
}

/// Reads bank SMS from the phone's inbox into the capture pipeline.
///
/// The live receiver only fires while the app process is alive and the vault
/// is unlocked. Everything else — alerts that arrived overnight, while the
/// vault was locked, or while Android had killed the app — is still in the SMS
/// inbox, so each unlock catches up from where the previous scan stopped. The
/// inbox is the durable queue; Khazana never keeps its own copy of raw SMS.
class SmsCatchUp {
  SmsCatchUp({
    required CaptureChannel channel,
    required CapturePipeline pipeline,
    required SmsScanCursor cursor,
    DateTime Function()? clock,
  })  : _channel = channel,
        _pipeline = pipeline,
        _cursor = cursor,
        _clock = clock ?? DateTime.now;

  final CaptureChannel _channel;
  final CapturePipeline _pipeline;
  final SmsScanCursor _cursor;
  final DateTime Function() _clock;

  /// Re-read a little before the cursor: a message delivered late can carry a
  /// timestamp slightly older than one already seen. Dedupe absorbs the repeats.
  static const overlap = Duration(hours: 1);

  /// Catches up since the last scan. The very first run only starts the clock —
  /// importing history is an explicit choice ([importHistory]), never a side
  /// effect of granting a permission.
  Future<SmsCatchUpResult> run() async {
    if (!await _channel.isSmsPermissionGranted()) return const SmsCatchUpResult();
    final now = _clock();
    final last = await _cursor.read();
    if (last == null) {
      await _cursor.write(now);
      return const SmsCatchUpResult();
    }
    return _scan(last.subtract(overlap), now);
  }

  /// Imports the last [window] of bank SMS. Captures it can't post confidently
  /// land in the review inbox like any other.
  Future<SmsCatchUpResult> importHistory({Duration window = const Duration(days: 90)}) async {
    if (!await _channel.isSmsPermissionGranted()) return const SmsCatchUpResult();
    final now = _clock();
    return _scan(now.subtract(window), now);
  }

  Future<SmsCatchUpResult> _scan(DateTime since, DateTime now) async {
    final messages = await _channel.readSmsSince(since);
    final result = SmsCatchUpResult.from(await _pipeline.ingestAll(messages));
    await _cursor.write(now);
    return result;
  }
}
