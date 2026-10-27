import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_online/capture/capture_draft.dart';
import 'package:khazana_online/capture/capture_sink.dart';
import 'package:khazana_online/capture/ui/review_inbox_screen.dart';

import 'helpers.dart';

void main() {
  test('capture code never logs or prints', () {
    final hits = [
      for (final f in Directory('lib/capture').listSync(recursive: true).whereType<File>())
        if (f.path.endsWith('.dart') && RegExp(r'\b(print|debugPrint|log|developer\.log)\(').hasMatch(f.readAsStringSync())) f.path,
    ];
    expect(hits, isEmpty);
  });

  test('capture code contains no client id or secret literals', () {
    final hits = [
      for (final f in Directory('lib/capture').listSync(recursive: true).whereType<File>())
        if (f.path.endsWith('.dart') && RegExp(r'\d{6,}-[a-z0-9]+\.apps\.googleusercontent|client_secret|GOCSPX').hasMatch(f.readAsStringSync())) f.path,
    ];
    expect(hits, isEmpty);
  });

  testWidgets('review inbox: approve, reject and edit', (tester) async {
    final sink = InMemoryCaptureSink();
    final ing = newIngestor(sink);
    await ing.ingest(hdfcDebit, DraftSource.gmail);
    await ing.ingest('Rs.99.00 debited from a/c XX4321 on 26-10-26 to VPA chai@okaxis. UPI Ref 111111111111', DraftSource.ocr);
    await ing.ingest('Rs.500.00 debited from a/c XX9999 on 24-10-26 to VPA shop@ybl. UPI Ref 222222222222', DraftSource.shortcut);

    await tester.pumpWidget(MaterialApp(home: ReviewInboxScreen(sink: sink)));
    await tester.pumpAndSettle();
    expect(find.text('Approve'), findsNWidgets(3));

    await tester.tap(find.text('Reject').first);
    await tester.pumpAndSettle();
    expect(find.text('Approve'), findsNWidgets(2));

    await tester.tap(find.text('Edit').first);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('edit-amount')), '0');
    await tester.tap(find.byKey(const Key('edit-save')));
    await tester.pumpAndSettle();
    expect(find.text('Enter an amount above zero.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('edit-amount')), '75.50');
    await tester.enterText(find.byKey(const Key('edit-merchant')), 'Corner shop');
    await tester.tap(find.byKey(const Key('edit-save')));
    await tester.pumpAndSettle();
    expect(find.text('Approve'), findsOneWidget);

    final all = await sink.all();
    expect(all.where((d) => d.status == DraftStatus.rejected), hasLength(1));
    final edited = all.singleWhere((d) => d.status == DraftStatus.approved);
    expect(edited.amount.toString(), '75.5');
    expect(edited.merchant, 'Corner shop');
  });

  testWidgets('empty inbox says so', (tester) async {
    await tester.pumpWidget(MaterialApp(home: ReviewInboxScreen(sink: InMemoryCaptureSink())));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('inbox-empty')), findsOneWidget);
  });
}
