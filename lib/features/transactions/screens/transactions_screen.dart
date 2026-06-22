import 'package:flutter/material.dart';

class TransactionsScreen extends StatelessWidget {
  const TransactionsScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Transactions')),
        body: const Center(child: Icon(Icons.receipt_long_outlined, size: 64)),
      );
}
