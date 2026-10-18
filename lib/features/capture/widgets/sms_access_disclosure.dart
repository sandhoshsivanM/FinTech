import 'package:flutter/material.dart';

import 'notification_access_disclosure.dart' show agreeLabel, declineLabel;

/// The prominent in-app disclosure shown before the system SMS permission
/// prompt (sideload build). Same rules as the notification-access one: inside
/// the app, says exactly what is read and why, and needs an explicit yes.
///
/// Returns true only when the user agrees. Callers must not request the SMS
/// permission on any other result.
Future<bool> showSmsAccessDisclosure(BuildContext context) async {
  final agreed = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (context) => const SmsAccessDisclosure(),
  );
  return agreed ?? false;
}

class SmsAccessDisclosure extends StatelessWidget {
  const SmsAccessDisclosure({super.key});

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final bold = Theme.of(context)
        .textTheme
        .bodyMedium
        ?.copyWith(fontWeight: FontWeight.w600);
    Widget point(String head, String body) => Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(head, style: bold),
              const SizedBox(height: 2),
              Text(body, style: TextStyle(color: muted, height: 1.4)),
            ],
          ),
        );

    return AlertDialog(
      icon: const Icon(Icons.sms_outlined),
      title: const Text('Read bank SMS to add transactions?'),
      content: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            point(
              'What Khazana reads',
              'Only SMS from bank and payment sender IDs such as "VM-HDFCBK". '
                  'Messages from phone numbers — your personal messages — are '
                  'skipped by Android-side code and never reach the app.',
            ),
            point(
              'Why',
              'So payments are recorded without typing. Ones Khazana is confident '
                  'about are added for you and announced with an Undo; anything '
                  'doubtful waits in Auto-capture for you to approve, correct or reject.',
            ),
            point(
              'Where it goes',
              'Nowhere. Each SMS is read on this device, in memory, and thrown away. '
                  'Only the amount, merchant, date and the last digits of the account '
                  'are kept, in your encrypted vault. Nothing is uploaded or shared.',
            ),
            point(
              'You are in control',
              'Optional and off until you allow it. To turn it off, open Android '
                  'Settings, then Apps, then Khazana SMS, then Permissions.',
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text(declineLabel),
        ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: const Text(agreeLabel),
        ),
      ],
    );
  }
}
