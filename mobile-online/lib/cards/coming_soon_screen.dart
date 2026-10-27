import 'package:flutter/material.dart';

/// Credit report and Offers are built separately (P5).
class ComingSoonScreen extends StatelessWidget {
  const ComingSoonScreen({super.key, required this.what});
  final String what;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(what)),
    body: Padding(
      padding: const EdgeInsets.all(16),
      child: Text(
        '$what is coming soon. Your cards and everything else work as they do today.',
      ),
    ),
  );
}
