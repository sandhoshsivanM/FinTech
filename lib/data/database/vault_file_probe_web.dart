import '../../core/security/vault_file_probe.dart';

/// No Flutter web build ships (see vault_executor_web.dart), so there is never
/// a vault file to find.
VaultFileProbe createVaultFileProbe() => const NoVaultFileProbe();
