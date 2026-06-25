/// Base error hierarchy for Khazana (PRD §3B `lib/core/` base error types).
///
/// Pure Dart, no Flutter imports — usable from services and isolates.
sealed class AppError implements Exception {
  const AppError(this.message);
  final String message;

  @override
  String toString() => '$runtimeType: $message';
}

/// Database / persistence failures.
class DatabaseError extends AppError {
  const DatabaseError(super.message);
}

/// Wrong PIN, biometric failure, or locked-out vault.
class AuthError extends AppError {
  const AuthError(super.message);
}

/// Backup file is not a valid Khazana backup, or failed validation (PRD §11).
class BackupError extends AppError {
  const BackupError(super.message);
}

/// File import / parsing failures.
class ImportError extends AppError {
  const ImportError(super.message);
}

/// Validation failure surfaced to the UI (e.g. start date after end date).
class ValidationError extends AppError {
  const ValidationError(super.message);
}
