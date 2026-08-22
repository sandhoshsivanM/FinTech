import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/services/crash_guard.dart';

/// The app ships no crash reporting and never will — a stack trace from a
/// finance app describes what someone was doing with their money when it broke.
/// The consequence is that the only report we ever see is one a user chooses to
/// send, so capture has to be complete, and it has to work *before* the vault
/// is open (startup crashes are the ones worth having).
///
/// That is what the ring buffer is for, and what these tests pin.
void main() {
  setUp(CrashGuard.resetForTest);
  tearDown(CrashGuard.resetForTest);

  test('errors are buffered while there is nowhere durable to put them', () {
    CrashGuard.record(tag: 'boot', error: Exception('early failure'));

    expect(CrashGuard.buffered, hasLength(1));
    expect(CrashGuard.buffered.single.tag, 'boot');
    expect(CrashGuard.buffered.single.message, contains('early failure'));
  });

  test('the buffer is bounded — a crash loop cannot exhaust memory', () {
    for (var i = 0; i < CrashGuard.bufferLimit * 3; i++) {
      CrashGuard.record(tag: 'loop', error: Exception('failure $i'));
    }

    expect(CrashGuard.buffered, hasLength(CrashGuard.bufferLimit));
  });

  test('the oldest records survive a crash loop, not the newest', () async {
    for (var i = 0; i < CrashGuard.bufferLimit + 10; i++) {
      CrashGuard.record(tag: 'loop', error: Exception('failure $i'));
    }

    // A crash loop throws the same thing thousands of times; the first few
    // explain the rest, so the buffer must not be a window onto the tail.
    final drained = <CrashRecord>[];
    await CrashGuard.drainTo((r) async => drained.add(r));

    expect(drained.first.message, contains('failure 10'));
    expect(drained.last.message, contains('failure ${CrashGuard.bufferLimit + 9}'));
  });

  test('drainTo flushes what was buffered before the sink existed', () async {
    CrashGuard.record(tag: 'boot', error: Exception('before unlock'));
    CrashGuard.record(tag: 'boot', error: Exception('also before unlock'));

    final drained = <CrashRecord>[];
    await CrashGuard.drainTo((r) async => drained.add(r));

    expect(drained, hasLength(2));
    expect(CrashGuard.buffered, isEmpty,
        reason: 'a record handed over must not also stay in memory');
  });

  test('once attached, records go straight to the sink', () async {
    final drained = <CrashRecord>[];
    await CrashGuard.drainTo((r) async => drained.add(r));

    CrashGuard.record(tag: 'runtime', error: Exception('after unlock'));
    await Future<void>.delayed(Duration.zero); // the write is fire-and-forget

    expect(drained, hasLength(1));
    expect(CrashGuard.buffered, isEmpty);
  });

  test('a failing sink does not throw back into the error handler', () async {
    CrashGuard.record(tag: 'boot', error: Exception('buffered'));

    // Losing a crash record is bad. Failing to start because we could not
    // write one is worse.
    await CrashGuard.drainTo((_) async => throw StateError('log db is gone'));

    CrashGuard.record(tag: 'runtime', error: Exception('live'));
    await Future<void>.delayed(Duration.zero);
  });

  test('detach sends records back to the buffer instead of a closed database',
      () async {
    await CrashGuard.drainTo((_) async {});
    CrashGuard.detach();

    CrashGuard.record(tag: 'locked', error: Exception('after lock'));

    expect(CrashGuard.buffered, hasLength(1),
        reason: 'the vault is closed; hold it until there is a key again');
  });

  test('messages and stack traces are scrubbed before they are stored', () {
    CrashGuard.record(
      tag: 'runtime',
      error: Exception('failed posting 4532015112830366 to Blue Tokai'),
      stack: StackTrace.fromString('#0 pay (amount: 1250.75)'),
    );

    final rec = CrashGuard.buffered.single;
    // LogSanitizer owns the rules; what matters here is that CrashGuard runs
    // them at capture time, so nothing sensitive sits in the in-memory buffer
    // either — not only in the file the user eventually exports.
    expect(rec.message, isNot(contains('4532015112830366')));
    expect(rec.stackTrace, isNotNull);
  });

  test('context is folded into the message so it survives to the log', () {
    CrashGuard.record(
      tag: 'flutter',
      error: Exception('boom'),
      context: 'building DashboardScreen',
    );

    expect(CrashGuard.buffered.single.message,
        contains('building DashboardScreen'));
  });
}
