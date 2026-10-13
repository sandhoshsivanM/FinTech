import '../../core/security/vault_file_probe.dart';
import 'vault_file_probe_io.dart'
    if (dart.library.js_interop) 'vault_file_probe_web.dart'
    as impl;

/// The platform's [VaultFileProbe].
VaultFileProbe createVaultFileProbe() => impl.createVaultFileProbe();
