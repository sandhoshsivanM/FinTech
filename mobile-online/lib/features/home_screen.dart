import 'package:flutter/material.dart';

import '../core/gateway_client.dart';
import 'sign_in_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.gateway});
  final GatewayClient gateway;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String _device = 'Checking this device…';

  static const _sections = [
    ('Accounts', 'Bank accounts, cards and cash, synced across your devices.'),
    ('Cards', 'Due dates and savings from the cards you already have.'),
    ('Connections', 'Your devices, and the banks you link.'),
  ];

  @override
  void initState() {
    super.initState();
    _checkDevice();
  }

  Future<void> _checkDevice() async {
    String status;
    try {
      final d = await widget.gateway.call('GET', '/v1/devices/me') as Map<String, dynamic>;
      status = d['has_key'] == true
          ? 'This device is registered and holds your data key.'
          : 'This device is registered. It gets your data key when you pair it with another device.';
    } on ApiException catch (e) {
      if (e.status == 401) return _toSignIn();
      status = (e.status == 403 || e.status == 404)
          ? 'This device is signed in but not registered as a device yet.'
          : 'The server refused the request (${e.status}).';
    } catch (_) {
      status = 'The server could not be reached.';
    }
    if (mounted) setState(() => _device = status);
  }

  void _toSignIn() {
    if (!mounted) return;
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => SignInScreen(gateway: widget.gateway)));
  }

  Future<void> _signOut() async {
    try {
      await widget.gateway.signOut();
    } catch (_) {
      // Signed out locally either way.
    }
    _toSignIn();
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Khazana Online'),
        actions: [TextButton(onPressed: _signOut, child: const Text('Sign out'))],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(_device, key: const Key('device-status'), style: TextStyle(color: muted)),
          const SizedBox(height: 12),
          for (final (title, body) in _sections)
            Card(
              child: ListTile(
                title: Text(title),
                subtitle: Text('$body\nComing in the next slice.'),
                isThreeLine: true,
              ),
            ),
        ],
      ),
    );
  }
}
