import 'package:flutter/material.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});
  @override
  Widget build(BuildContext context) =>
      const _Stub(title: 'Dashboard', icon: Icons.dashboard_outlined);
}

class _Stub extends StatelessWidget {
  const _Stub({required this.title, required this.icon});
  final String title;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(title)),
        body: Center(child: Icon(icon, size: 64)),
      );
}
