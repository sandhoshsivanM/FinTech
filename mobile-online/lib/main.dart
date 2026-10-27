import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import 'app_services.dart';
import 'core/config.dart';
import 'core/gateway_client.dart';
import 'core/google_auth.dart';
import 'core/key_store.dart';
import 'core/passkey.dart';
import 'features/gate_screen.dart';
import 'features/sign_in_screen.dart';
import 'sync/record_store.dart';

/// Khazana Online: a separate app from the offline Khazana (ADR 0007), with an
/// account and end-to-end encrypted sync. It never imports the offline app;
/// domain logic comes from packages/khazana_domain.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final keyStore = SecureKeyStore();
  final gateway = GatewayClient(
    baseUrl: gatewayUrl(),
    platform: platformName(),
    store: keyStore,
    passkeys: PlatformPasskeys(),
    google: GoogleSignInTokens(),
  );
  final dir = await getApplicationSupportDirectory();
  final records = await FileRecordStore.open(File('${dir.path}/khazana_online_records.json'));
  runApp(KhazanaOnlineApp(services: AppServices(gateway: gateway, keyStore: keyStore, records: records)));
}

class KhazanaOnlineApp extends StatelessWidget {
  const KhazanaOnlineApp({super.key, required this.services});
  final AppServices services;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Khazana Online',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF111214)), useMaterial3: true),
      darkTheme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF111214), brightness: Brightness.dark),
          useMaterial3: true),
      home: _Start(services: services),
    );
  }
}

/// Opens the gate (home, setup) if this device is signed in, otherwise sign-in.
class _Start extends StatelessWidget {
  const _Start({required this.services});
  final AppServices services;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<bool>(
      future: services.gateway.isSignedIn(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const Scaffold(body: Center(child: CircularProgressIndicator()));
        return snapshot.data! ? GateScreen(services: services) : SignInScreen(services: services);
      },
    );
  }
}
