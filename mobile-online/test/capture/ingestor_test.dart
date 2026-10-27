import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_online/capture/capture_draft.dart';
import 'package:khazana_online/capture/capture_ingestor.dart';
import 'package:khazana_online/capture/capture_sink.dart';
import 'package:khazana_domain/entities/transaction.dart' show TxnType;

import 'helpers.dart';

void main() {
  test('a bank SMS becomes a pending draft with parsed values only', () async {
    final sink = InMemoryCaptureSink();
    final out = await newIngestor(sink).ingest(hdfcDebit, DraftSource.shortcut);
    expect(out, IngestOutcome.added);
    final d = (await sink.all()).single;
    expect(d.amount.toString(), '1250');
    expect(d.type, TxnType.expense);
    expect(d.accountLast4, '1234');
    expect(d.utr, '429876543210');
    expect(d.status, DraftStatus.pending);
    expect(d.source, DraftSource.shortcut);
    // Nothing from the message body survives except the parsed fields.
    final json = jsonEncode(d.toJson());
    expect(json, isNot(contains('Avl Bal')));
    expect(json, isNot(contains('debited')));
  });

  test('the same alert twice, from two sources, is one draft', () async {
    final sink = InMemoryCaptureSink();
    final ing = newIngestor(sink);
    expect(await ing.ingest(hdfcDebit, DraftSource.shortcut), IngestOutcome.added);
    expect(await ing.ingest(hdfcDebit, DraftSource.gmail), IngestOutcome.duplicate);
    expect((await sink.all()), hasLength(1));
  });

  test('a rejected draft does not come back when the alert is re-delivered', () async {
    final sink = InMemoryCaptureSink();
    final ing = newIngestor(sink);
    await ing.ingest(hdfcDebit, DraftSource.gmail);
    final id = (await sink.all()).single.id;
    await sink.decide(id, DraftStatus.rejected);
    expect(await ing.ingest(hdfcDebit, DraftSource.gmail), IngestOutcome.duplicate);
    expect((await sink.all()).single.status, DraftStatus.rejected);
  });

  test('OTPs and chatter are ignored', () async {
    final sink = InMemoryCaptureSink();
    expect(await newIngestor(sink).ingest(otpSms, DraftSource.shortcut), IngestOutcome.ignored);
    expect(await newIngestor(sink).ingest('see you at 5', DraftSource.ocr), IngestOutcome.ignored);
    expect(await sink.all(), isEmpty);
  });

  test('a long email is trimmed to the stretch around the amount, not rejected', () async {
    final filler = 'Dear customer, thank you for banking with us. ' * 120;
    final email = '$filler $hdfcDebit $filler';
    expect(email.length, greaterThan(5000));
    final fitted = CaptureIngestor.fitForParser(email);
    expect(fitted.length, lessThanOrEqualTo(2000));
    expect(fitted, contains('429876543210'));
    expect(await newIngestor().ingest(email, DraftSource.gmail), IngestOutcome.added);
  });

  test('draft JSON round-trips', () async {
    final sink = InMemoryCaptureSink();
    await newIngestor(sink).ingest(hdfcDebit, DraftSource.ocr);
    final d = (await sink.all()).single;
    final back = CaptureDraft.tryFromJson(jsonDecode(jsonEncode(d.toJson())))!;
    expect(back.toJson(), d.toJson());
    expect(CaptureDraft.tryFromJson({'amount': 'x'}), isNull);
  });

  test('edited approval keeps the user corrections', () async {
    final sink = InMemoryCaptureSink();
    await newIngestor(sink).ingest(hdfcDebit, DraftSource.gmail);
    final d = (await sink.all()).single;
    await sink.decide(d.id, DraftStatus.approved, edited: d.copyWith(merchant: 'Swiggy'));
    final after = (await sink.all()).single;
    expect(after.status, DraftStatus.approved);
    expect(after.merchant, 'Swiggy');
    expect(after.decidedAt, isNotNull);
  });
}
