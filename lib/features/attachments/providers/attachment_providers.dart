import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/security/vault_state.dart';
import '../services/attachment_service.dart';

/// Receipts are encrypted with the vault key, so this rebuilds when the vault
/// changes and throws while locked — the same contract as [appDatabaseProvider].
/// Every screen that reads attachments is already behind the unlock gate.
final attachmentServiceProvider = Provider<AttachmentService>((ref) {
  final vault = ref.watch(vaultUnlockProvider);
  if (vault is! VaultUnlocked) {
    throw StateError('Vault is locked — receipts unavailable.');
  }
  return AttachmentService(key: vault.session.key);
});
