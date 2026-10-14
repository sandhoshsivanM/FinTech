import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/features/capture/widgets/notification_access_disclosure.dart';

/// Play's prominent-disclosure rule: the system notification-access screen may
/// only be opened after an explicit "agree" tap on an in-app explanation.
void main() {
  Future<void> pump(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => showNotificationAccessDisclosure(context),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'states what is read, why, where it goes and how to turn it off',
    (tester) async {
      await pump(tester);
      expect(find.text('What Khazana reads'), findsOneWidget);
      expect(find.text('Why'), findsOneWidget);
      expect(find.text('Where it goes'), findsOneWidget);
      expect(find.text('You are in control'), findsOneWidget);
      expect(find.textContaining('uploaded'), findsOneWidget);
      expect(find.textContaining('turn it off'), findsOneWidget);
    },
  );

  testWidgets('agree returns true', (tester) async {
    bool? result;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () async =>
                result = await showNotificationAccessDisclosure(context),
            child: const Text('open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(agreeLabel));
    await tester.pumpAndSettle();
    expect(result, isTrue);
  });

  testWidgets('not now returns false and tapping outside cannot dismiss', (
    tester,
  ) async {
    bool? result;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () async =>
                result = await showNotificationAccessDisclosure(context),
            child: const Text('open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tapAt(const Offset(2, 2)); // the scrim
    await tester.pumpAndSettle();
    expect(find.text(agreeLabel), findsOneWidget, reason: 'still showing');
    await tester.tap(find.text(declineLabel));
    await tester.pumpAndSettle();
    expect(result, isFalse);
  });
}
