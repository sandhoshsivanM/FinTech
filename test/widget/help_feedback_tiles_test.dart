import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/branding.dart';
import 'package:khazana/core/help/section_help.dart';
import 'package:khazana/features/settings/screens/help_feedback_tiles.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<void> pump(
    WidgetTester tester, {
    required MailLauncher launcher,
    VoidCallback? onReport,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          home: Scaffold(
            body: HelpFeedbackTiles(
              launcher: launcher,
              onReportProblem: onReport ?? () {},
            ),
          ),
        ),
      ),
    );
  }

  testWidgets('shows Send feedback and Report a problem', (tester) async {
    await pump(tester, launcher: (_) async => true);
    expect(find.text('Send feedback'), findsOneWidget);
    expect(find.text('Report a problem'), findsOneWidget);
  });

  testWidgets('Send feedback launches a mailto to the feedback address', (
    tester,
  ) async {
    Uri? launched;
    await pump(
      tester,
      launcher: (uri) async {
        launched = uri;
        return true;
      },
    );
    await tester.tap(find.text('Send feedback'));
    await tester.pumpAndSettle();

    expect(launched, isNotNull);
    expect(launched!.scheme, 'mailto');
    expect(launched!.path, kFeedbackEmail);
    expect(
      launched!.queryParameters['subject'],
      startsWith('Khazana feedback — $kAppVersion ('),
    );
    expect(launched!.queryParameters['body'], contains('Theme: system'));
    expect(find.byType(FeedbackFallbackDialog), findsNothing);
  });

  testWidgets('falls back to a copyable address when no mail app', (
    tester,
  ) async {
    await pump(tester, launcher: (_) async => false);
    await tester.tap(find.text('Send feedback'));
    await tester.pumpAndSettle();

    expect(find.byType(FeedbackFallbackDialog), findsOneWidget);
    expect(find.text(kFeedbackEmail), findsOneWidget);
    expect(find.byTooltip('Copy address'), findsOneWidget);
    expect(find.text('Copy message'), findsOneWidget);
  });

  testWidgets('Report a problem hands off to the export flow', (tester) async {
    var reported = 0;
    await pump(tester, launcher: (_) async => true, onReport: () => reported++);
    await tester.tap(find.text('Report a problem'));
    expect(reported, 1);
  });

  test('the group has a help entry', () {
    expect(SectionHelp.all.containsKey('settings.helpFeedback'), isTrue);
  });
}
