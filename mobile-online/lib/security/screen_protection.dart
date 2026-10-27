// Screen protection. Android sets FLAG_SECURE on the window (no screenshots, no
// screen recording, blank recents thumbnail); iOS covers the app with a blur in
// the app switcher and while the screen is being recorded or mirrored. Native
// code turns this ON for the whole app at start-up (stronger default: balances
// and keys appear on many screens); [ProtectedScreen] re-asserts it on the
// screens that show a recovery phrase, keys or balances, so a future relaxation
// of the default cannot silently expose them.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

abstract class ScreenProtection {
  Future<void> acquire();
  Future<void> release();
}

class ChannelScreenProtection implements ScreenProtection {
  ChannelScreenProtection([MethodChannel? channel]) : _c = channel ?? const MethodChannel('khazana/screen');
  final MethodChannel _c;

  Future<void> _set(String method) async {
    try {
      await _c.invokeMethod<void>(method);
    } on MissingPluginException {
      // No native side (tests, desktop).
    }
  }

  @override
  Future<void> acquire() => _set('acquire');
  @override
  Future<void> release() => _set('release');
}

/// Wrap any screen that shows a recovery phrase, keys or balances.
class ProtectedScreen extends StatefulWidget {
  const ProtectedScreen({super.key, required this.child, this.protection});
  final Widget child;
  final ScreenProtection? protection;

  @override
  State<ProtectedScreen> createState() => _ProtectedScreenState();
}

class _ProtectedScreenState extends State<ProtectedScreen> {
  late final ScreenProtection _p = widget.protection ?? ChannelScreenProtection();

  @override
  void initState() {
    super.initState();
    _p.acquire();
  }

  @override
  void dispose() {
    _p.release();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
