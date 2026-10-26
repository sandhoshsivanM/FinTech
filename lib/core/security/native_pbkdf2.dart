import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'key_derivation_service.dart';

/// Plugs Android's own PBKDF2 (javax.crypto, native code) into
/// [KeyDerivationService]. Elsewhere it does nothing and Dart's is used.
void installNativePbkdf2() {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
  const channel = MethodChannel('khazana/kdf');
  KeyDerivationService.platformDeriver = (pin, salt, iterations, keyLength) async {
    final key = await channel.invokeMethod<Uint8List>('pbkdf2', {
      'pin': pin,
      'salt': salt,
      'iterations': iterations,
      'keyLength': keyLength,
    });
    if (key == null) throw StateError('no key');
    return key;
  };
}
