'use client';
import { useState } from 'react';
import { ShieldCheck, Fingerprint, ShieldAlert } from 'lucide-react';
import { APP_TAGLINE, TRUST_POINTS } from '@/lib/brand';
import { BrandMark, WordMark } from './BrandMark';
import { useApp } from '@/lib/store';
import { cryptoAvailable } from '@/lib/crypto';

export function VaultGate() {
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const setup = useApp((s) => s.setup);
  const unlock = useApp((s) => s.unlock);
  const stranded = useApp((s) => s.strandedRecords);
  const setAsideStranded = useApp((s) => s.setAsideStranded);
  const [confirmAside, setConfirmAside] = useState(false);

  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localErr, setLocalErr] = useState<string | null>(null);

  const isSetup = status === 'uninitialized';
  const busy = status === 'unlocking' || status === 'loading';

  /**
   * Minimum digits for a *new* PIN.
   *
   * Four digits is 10,000 candidates. PBKDF2 at 600k iterations makes each
   * guess cost real work, but an exported `.ftos` backup can be attacked
   * offline on a GPU with no rate limit at all, and 10,000 candidates does not
   * survive that however expensive each one is. Six raises it to a million,
   * which combined with the unlock throttle in `store.ts` is a meaningful
   * floor for a vault a user will actually type into every day.
   */
  const MIN_PIN_LENGTH = 6;

  // Browsers expose Web Crypto only in a secure context. Reaching this build
  // over plain http on a LAN address — the normal way to open it on a phone —
  // leaves `crypto.subtle` undefined, and the vault cannot be encrypted at all.
  // Say so before the PIN is typed rather than after it is submitted.
  const secure = cryptoAvailable();

  const submit = () => {
    setLocalErr(null);
    if (!secure) return;
    // Only enforced when *setting* a PIN. An existing 4-digit vault must still
    // open, or raising the floor would lock out the very users it was meant to
    // protect.
    if (isSetup && pin.length < MIN_PIN_LENGTH) {
      return setLocalErr(`PIN must be at least ${MIN_PIN_LENGTH} digits.`);
    }
    if (!isSetup && pin.length === 0) return setLocalErr('Enter your PIN.');
    if (isSetup && pin !== confirm) return setLocalErr('PINs do not match.');
    if (isSetup) void setup(pin); else void unlock(pin);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <BrandMark size={96} priority />
          <WordMark className="mt-5 fs-26 text-ink" />
          {/* The rules either side of the tagline are from the brand lockup. */}
          <p className="mt-2.5 flex items-center gap-3 fs-11.5 font-semibold text-gold-ink">
            <span className="h-px w-6 bg-[var(--gold)] opacity-45" aria-hidden="true" />
            {APP_TAGLINE}
            <span className="h-px w-6 bg-[var(--gold)] opacity-45" aria-hidden="true" />
          </p>
        </div>

        <div className="glass p-6">
          {!secure && (
            <div className="mb-4 rounded-[var(--radius-card)] border border-line bg-warning-soft p-3.5 flex gap-3">
              <ShieldAlert size={16} className="shrink-0 mt-0.5 text-warning" />
              <div className="fs-12.5 leading-relaxed">
                <b className="block text-ink">This address can&rsquo;t encrypt your vault.</b>
                <span className="text-ink-soft">
                  Browsers only allow encryption over <b>https://</b> or on{' '}
                  <b>localhost</b>. You are on a plain <b>http://</b> network
                  address, where the encryption API is switched off — so Khazana
                  will not open a vault here rather than store your finances
                  unencrypted.
                </span>
              </div>
            </div>
          )}
          {isSetup && stranded > 0 ? (
            /* Data is here but the vault row that opens it is gone. Offering
               setup would write a new salt over it, so explain instead, and
               make "start again" an explicit, non-destructive choice. */
            <div>
              <h2 className="text-lg font-medium mb-1">Your earlier data is still here</h2>
              <p className="text-sm text-ink-soft leading-relaxed">
                This browser holds {stranded} encrypted record{stranded === 1 ? '' : 's'} from
                an earlier vault, but the information needed to open them is missing.
                Nothing has been changed or deleted.
              </p>
              <p className="text-sm text-muted leading-relaxed mt-2">
                If you have a backup file, start a new vault and restore it from
                Settings → Privacy &amp; Backup.
              </p>
              {error && (
                <div className="mt-3 flex items-center gap-2 text-expense text-sm"><span>⚠</span>{error}</div>
              )}
              {confirmAside ? (
                <div className="mt-5 grid gap-2">
                  <p className="fs-12.5 text-ink-soft">
                    The old records will be kept in this browser, set aside where
                    Khazana will not open them. Do not clear this site&rsquo;s data.
                  </p>
                  <button
                    onClick={() => void setAsideStranded()}
                    className="focus-ring w-full rounded-btn bg-primary text-[var(--primary-fg)] font-semibold py-3"
                  >
                    Set them aside and start a new vault
                  </button>
                  <button onClick={() => setConfirmAside(false)} className="focus-ring w-full rounded-btn py-2.5 text-sm font-semibold text-ink-soft hover:bg-fill">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmAside(true)}
                  className="focus-ring mt-5 w-full rounded-btn border border-line-strong py-3 text-sm font-semibold text-ink hover:border-accent"
                >
                  Start a new vault…
                </button>
              )}
            </div>
          ) : (<>
          <h2 className="text-lg font-medium mb-1">{isSetup ? 'Set up your vault' : 'Unlock'}</h2>
          {isSetup && (
            <p className="text-sm text-muted mb-4">Your PIN encrypts everything in this browser. It is never stored.</p>
          )}
          <input
            type="password" inputMode="numeric" autoFocus value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter' && !isSetup) submit(); }}
            placeholder={isSetup ? 'Create PIN' : 'Enter PIN'}
            className="w-full rounded-[var(--radius-panel)] bg-[var(--fill)] border border-[var(--glass-border)] px-4 py-3 outline-none focus:border-accent"
          />
          {isSetup && (
            <input
              type="password" inputMode="numeric" value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="Confirm PIN"
              className="mt-3 w-full rounded-[var(--radius-panel)] bg-[var(--fill)] border border-[var(--glass-border)] px-4 py-3 outline-none focus:border-accent"
            />
          )}
          {(localErr || error) && (
            <div className="mt-3 flex items-center gap-2 text-expense text-sm">
              <span>⚠</span>{localErr ?? error}
            </div>
          )}
          <button
            onClick={submit} disabled={busy || !secure}
            className="focus-ring mt-5 w-full rounded-btn bg-primary text-[var(--primary-fg)] font-semibold py-3 transition-shadow duration-[250ms] hover:shadow-[var(--glow)] disabled:opacity-60"
          >
            {busy ? 'Working…' : isSetup ? 'Create vault' : 'Unlock'}
          </button>
          {!isSetup && (
            <div className="mt-3 flex items-center justify-center gap-2 text-muted text-sm">
              <Fingerprint size={16} /> PIN secured with PBKDF2 + AES-256
            </div>
          )}
          </>)}
        </div>
        <ul className="mt-6 grid gap-2.5">
          {TRUST_POINTS.map((t) => (
            <li key={t.title} className="flex items-start gap-2.5 fs-12 leading-snug">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
              <span>
                <b className="font-semibold text-ink">{t.title}.</b>{' '}
                <span className="text-muted">{t.detail}</span>
              </span>
            </li>
          ))}
        </ul>

      </div>
    </div>
  );
}
