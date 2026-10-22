import 'package:flutter/material.dart';

import 'core/config.dart';
import 'core/gateway_client.dart';
import 'core/key_store.dart';
import 'features/home_screen.dart';
import 'features/sign_in_screen.dart';

/// Khazana Online: a separate app from the offline Khazana (ADR 0007), with an
/// account and end-to-end encrypted sync. It never imports the offline app;
/// domain logic comes from packages/khazana_domain.
void main() {
  final gateway = GatewayClient(baseUrl: gatewayUrl(), platform: platformName(), store: SecureKeyStore());
  runApp(KhazanaOnlineApp(gateway: gateway));
}

class KhazanaOnlineApp extends StatelessWidget {
  const KhazanaOnlineApp({super.key, required this.gateway});
  final GatewayClient gateway;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Khazana Online',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF111214)), useMaterial3: true),
      darkTheme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF111214), brightness: Brightness.dark),
          useMaterial3: true),
      home: _Start(gateway: gateway),
    );
  }
}

/// Opens home if this device is signed in, otherwise sign-in.
class _Start extends StatelessWidget {
  const _Start({required this.gateway});
  final GatewayClient gateway;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<bool>(
      future: gateway.isSignedIn(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const Scaffold(body: Center(child: CircularProgressIndicator()));
        return snapshot.data! ? HomeScreen(gateway: gateway) : SignInScreen(gateway: gateway);
      },
    );
  }
}
