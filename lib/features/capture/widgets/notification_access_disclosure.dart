import 'package:flutter/material.dart';

/// The prominent in-app disclosure Google Play's User Data policy requires
/// before an app sends someone to grant a sensitive access. It must (a) be
/// shown inside the app, (b) describe exactly what is accessed and why, and
/// (c) need an explicit action, so it is a modal with two equal choices and no
/// way to proceed by dismissing it.
///
/// Returns true only when the user taps [agreeLabel]. Callers must not open
/// the system notification-access settings on any other result.
Future<bool> showNotificationAccessDisclosure(BuildContext context) async {
  final agreed = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (context) => const NotificationAccessDisclosure(),
  );
  return agreed ?? false;
}

const String agreeLabel = 'Agree and continue';
const String declineLabel = 'Not now';

class NotificationAccessDisclosure extends StatelessWidget {
  const NotificationAccessDisclosure({super.key});

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final bold = Theme.of(
      context,
    ).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600);
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
      icon: const Icon(Icons.notifications_active_outlined),
      title: const Text('Read bank alerts to add transactions?'),
      content: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            point(
              'What Khazana reads',
              'If you continue, Android will ask you to give Khazana notification '
                  'access. Android shares the notifications that appear on this '
                  'phone with the app. Khazana looks only for bank and UPI payment '
                  'alerts (for example "Rs 450 debited at a store") and ignores '
                  'every other notification.',
            ),
            point(
              'Why',
              'To suggest transactions for you to review, so you do not have to '
                  'type each payment in by hand. Nothing is added until you tap Add.',
            ),
            point(
              'Where it goes',
              'Nowhere. The text is read on this device, in memory, and thrown '
                  'away straight away. Only the amount, merchant and date of a '
                  'payment alert are kept, in your encrypted vault. Nothing is '
                  'uploaded, shared or used for ads, because Khazana has no server.',
            ),
            point(
              'You are in control',
              'This is optional and off until you turn it on. To turn it off, open '
                  'Android Settings, then Notifications, then Notification access '
                  '(the path varies by phone) and switch Khazana off.',
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
