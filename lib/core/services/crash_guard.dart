import 'dart:async';
import 'dart:collection';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../domain/services/log_sanitizer.dart';

/// One captured crash, already scrubbed of anything that could identify a
/// merchant or an amount.
@immutable
class CrashRecord {
  const CrashRecord({
    required this.tag,
    required this.message,
    required this.stackTrace,
    required this.at,
  });

  final String tag;
  final String message;
  final String? stackTrace;
  final DateTime at;
}

/// Catches everything Flutter can throw and keeps it on the device.
///
/// This exists because the app ships no crash reporting, and never will — a
/// stack trace from a finance app is a description of what the user was doing
/// when it broke, and we have no business holding that. The consequence is that
/// the only crash report we ever see is one a user chooses to send us from
/// Settings, so it has to be captured completely and it has to survive being
/// captured before the vault is open.
///
/// Hence the ring buffer. The encrypted log database ([LogsDatabase]) is keyed
/// by the vault key, so it does not exist until the user unlocks. Errors thrown
/// during startup — the most valuable ones — would otherwise land nowhere.
/// [install] runs before `runApp`, buffers into memory, and [drainTo] hands
/// everything over once there is somewhere durable to put it.
class CrashGuard {
  CrashGuard._();

  /// Small on purpose. A crash loop can throw thousands of times a second, and
  /// the first few are the ones that explain the last few.
  static const int bufferLimit = 50;

  static final Queue<CrashRecord> _buffer = Queue<CrashRecord>();
  static Future<void> Function(CrashRecord)? _sink;
  static bool _installed = false;

  @visibleForTesting
  static List<CrashRecord> get buffered => List.unmodifiable(_buffer);

  @visibleForTesting
  static void resetForTest() {
    _buffer.clear();
    _sink = null;
    _installed = false;
  }

  /// Installs the three handlers that between them cover every uncaught error:
  /// framework errors during build/layout/paint, errors from the engine's own
  /// callbacks, and the widget shown in their place.
  ///
  /// Errors raised inside an async gap escape all three, which is what the
  /// `runZonedGuarded` wrapper in `main()` is for.
  static void install() {
    if (_installed) return;
    _installed = true;

    final priorOnError = FlutterError.onError;
    FlutterError.onError = (details) {
      record(
        tag: 'flutter',
        error: details.exception,
        stack: details.stack,
        context: details.context?.toString(),
      );
      // In debug this prints the familiar red console dump; keeping it means
      // adding the guard never makes local debugging worse.
      priorOnError?.call(details);
    };

    PlatformDispatcher.instance.onError = (error, stack) {
      record(tag: 'platform', error: error, stack: stack);
      return true; // handled — do not let the engine tear the isolate down
    };

    // The default red-on-grey error box is a dead end: in a release build it
    // says nothing useful and offers no way out. This one at least tells the
    // user the rest of the app still works and that their data is untouched,
    // which for a vault is the only question they actually have.
    ErrorWidget.builder = (details) {
      record(
        tag: 'widget',
        error: details.exception,
        stack: details.stack,
        context: details.context?.toString(),
      );
      return const _CrashPlaceholder();
    };
  }

  /// Records one error. Public so `runZonedGuarded` and any deliberate
  /// catch-and-continue site can feed the same buffer.
  static void record({
    required String tag,
    required Object error,
    StackTrace? stack,
    String? context,
  }) {
    final message = context == null
        ? error.toString()
        : '$error (while $context)';
    final rec = CrashRecord(
      tag: tag,
      // Scrubbed here rather than at the sink so nothing sensitive sits in the
      // in-memory buffer either.
      message: LogSanitizer.scrub(message),
      stackTrace: stack == null ? null : LogSanitizer.scrub(stack.toString()),
      at: DateTime.now(),
    );

    final sink = _sink;
    if (sink != null) {
      // Fire and forget: a failure to write the log must never itself throw
      // into the error handler that is currently running.
      unawaited(sink(rec).catchError((_) {}));
      return;
    }

    _buffer.addLast(rec);
    while (_buffer.length > bufferLimit) {
      _buffer.removeFirst();
    }
  }

  /// Attaches durable storage and flushes whatever was buffered before it
  /// existed. Safe to call more than once; the buffer is drained exactly once
  /// because each record is removed as it is handed over.
  static Future<void> drainTo(Future<void> Function(CrashRecord) sink) async {
    _sink = sink;
    while (_buffer.isNotEmpty) {
      final rec = _buffer.removeFirst();
      try {
        await sink(rec);
      } catch (_) {
        // The log database is best-effort. Losing a crash record is bad;
        // failing to start because we could not write one is worse.
      }
    }
  }

  /// Detaches the sink — call when the vault locks, so nothing is written to a
  /// database that is about to close.
  static void detach() => _sink = null;
}

class _CrashPlaceholder extends StatelessWidget {
  const _CrashPlaceholder();

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 32),
              const SizedBox(height: 12),
              Text(
                'This section could not be shown',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              Text(
                'Your data is safe and unchanged. Go back and try again — '
                'Settings → Export error log will tell us what happened.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
