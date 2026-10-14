import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/branding.dart';
import '../../../core/entitlement/distribution_channel.dart';
import '../../../core/feedback/feedback_mail.dart';
import '../providers/theme_providers.dart';

/// Opens a `mailto:` URI. Returns false when there is no mail app to take it.
typedef MailLauncher = Future<bool> Function(Uri uri);

Future<bool> _defaultLauncher(Uri uri) async {
  try {
    return await launchUrl(uri, mode: LaunchMode.externalApplication);
  } on Object {
    // Some platforms throw rather than return false when nothing handles
    // mailto:. Either way the fallback dialog is the answer.
    return false;
  }
}

/// Collects the non-financial device facts for a feedback email.
FeedbackDeviceInfo collectFeedbackDeviceInfo(
  BuildContext context,
  ThemeMode themeMode,
) {
  final locale =
      Localizations.maybeLocaleOf(context) ??
      WidgetsBinding.instance.platformDispatcher.locale;
  final width = MediaQuery.maybeSizeOf(context)?.width ?? 0;
  return FeedbackDeviceInfo(
    appVersion: kAppVersion,
    channel: kChannel.name,
    platform: kIsWeb ? 'web' : Platform.operatingSystem,
    osVersion: kIsWeb ? '' : Platform.operatingSystemVersion,
    locale: locale.toLanguageTag(),
    themeMode: themeMode.name,
    screenClass: screenSizeClass(width),
  );
}

/// The "Send feedback" and "Report a problem" rows of Settings → Help &
/// feedback.
///
/// "Report a problem" is the old "Export error log" with an addressee: the
/// caller supplies [onReportProblem], which keeps the existing disclaimer
/// dialog and sanitized export in one place.
class HelpFeedbackTiles extends ConsumerWidget {
  const HelpFeedbackTiles({
    super.key,
    required this.onReportProblem,
    this.launcher = _defaultLauncher,
  });

  final VoidCallback onReportProblem;
  final MailLauncher launcher;

  Future<void> _sendFeedback(BuildContext context, WidgetRef ref) async {
    final info = collectFeedbackDeviceInfo(
      context,
      ref.read(themeModeProvider),
    );
    final uri = buildFeedbackMailto(info);
    final ok = await launcher(uri);
    if (ok || !context.mounted) return;
    await showDialog<void>(
      context: context,
      builder: (_) => FeedbackFallbackDialog(info: info),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ListTile(
          key: const Key('settings.sendFeedback'),
          leading: const Icon(Icons.mail_outline),
          title: const Text('Send feedback'),
          subtitle: const Text(
            'Opens your mail app — nothing is sent until you do',
          ),
          onTap: () => _sendFeedback(context, ref),
        ),
        ListTile(
          key: const Key('settings.reportProblem'),
          leading: const Icon(Icons.bug_report_outlined),
          title: const Text('Report a problem'),
          subtitle: const Text('Share the error log — no financial data'),
          onTap: onReportProblem,
        ),
      ],
    );
  }
}

/// Shown when no mail app accepted the `mailto:` link: the address and the
/// prefilled message, both selectable and copyable, so the user can paste them
/// into whatever they use for email.
class FeedbackFallbackDialog extends StatelessWidget {
  const FeedbackFallbackDialog({super.key, required this.info});

  final FeedbackDeviceInfo info;

  Future<void> _copy(BuildContext context, String text, String what) async {
    final messenger = ScaffoldMessenger.maybeOf(context);
    await Clipboard.setData(ClipboardData(text: text));
    messenger?.showSnackBar(SnackBar(content: Text('$what copied')));
  }

  @override
  Widget build(BuildContext context) {
    final message = 'Subject: ${feedbackSubject(info)}\n${feedbackBody(info)}';
    final textTheme = Theme.of(context).textTheme;
    return AlertDialog(
      title: const Text('No mail app found'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Send your feedback to:'),
            const SizedBox(height: 8),
            Row(
              children: [
                const Expanded(child: SelectableText(kFeedbackEmail)),
                IconButton(
                  tooltip: 'Copy address',
                  icon: const Icon(Icons.copy, size: 18),
                  onPressed: () => _copy(context, kFeedbackEmail, 'Address'),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text('Suggested message', style: textTheme.labelLarge),
            const SizedBox(height: 4),
            SelectableText(message, style: textTheme.bodySmall),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => _copy(context, message, 'Message'),
          child: const Text('Copy message'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Done'),
        ),
      ],
    );
  }
}
