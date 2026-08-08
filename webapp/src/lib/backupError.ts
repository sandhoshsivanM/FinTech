/**
 * Why a restore failed, in terms a user can act on.
 *
 * The settings screen used to catch everything and print "Incorrect vault or
 * corrupted file. Make sure you are using a backup created with the same PIN."
 * That sentence is wrong in the most common case: a v1 backup is bound to the
 * *vault* that made it, so the right PIN on a second device fails too. Naming
 * the actual cause is the difference between a fixable problem and a mystery.
 */
export type BackupFailure = 'unreadable' | 'needs-pin' | 'wrong-pin' | 'wrong-vault';

export class BackupError extends Error {
  constructor(public readonly reason: BackupFailure, message: string) {
    super(message);
    this.name = 'BackupError';
  }
}
