import 'package:flutter/material.dart';

/// Placeholder — full goals module is built in milestone P3g (PRD §8).
class GoalsScreen extends StatelessWidget {
  const GoalsScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Goals')),
        body: const Center(child: Icon(Icons.flag_outlined, size: 64)),
      );
}
