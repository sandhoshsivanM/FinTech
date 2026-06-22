import 'package:flutter/material.dart';

class BudgetScreen extends StatelessWidget {
  const BudgetScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Budget')),
        body: const Center(child: Icon(Icons.pie_chart_outline, size: 64)),
      );
}
