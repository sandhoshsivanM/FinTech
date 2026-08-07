'use client';
import { useState } from 'react';
import { ShieldCheck, Fingerprint } from 'lucide-react';
import { APP_TAGLINE, TRUST_POINTS } from '@/lib/brand';
import { BrandMark, WordMark } from './BrandMark';
import { useApp } from '@/lib/store';

export function VaultGate() {
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const setup = useApp((s) => s.setup);
  const unlock = useApp((s) => s.unlock);

  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localErr, setLocalErr] = useState<string | null>(null);

  const isSetup = status === 'uninitialized';
  const busy = status === 'unlocking' || status === 'loading';

  const submit = () => {
    setLocalErr(null);
    if (pin.length < 4) return setLocalErr('PIN must be at least 4 digits.');
    if (isSetup && pin !== confirm) return setLocalErr('PINs do not match.');
    if (isSetup) void setup(pin); else void unlock(pin);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <BrandMark size={96} priority />
          <WordMark className="mt-5 text-[26px] text-ink" />
          {/* The rules either side of the tagline are from the brand lockup. */}
          <p className="mt-2.5 flex items-center gap-3 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-gold-ink">
            <span className="h-px w-6 bg-[var(--gold)] opacity-45" aria-hidden="true" />
            {APP_TAGLINE}
            <span className="h-px w-6 bg-[var(--gold)] opacity-45" aria-hidden="true" />
          </p>
        </div>

        <div className="glass p-6">
          <h2 className="text-lg font-bold mb-1">{isSetup ? 'Set up your vault' : 'Unlock'}</h2>
          {isSetup && (
            <p className="text-sm text-muted mb-4">Your PIN encrypts everything in this browser. It is never stored.</p>
          )}
          <input
            type="password" inputMode="numeric" autoFocus value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !isSetup) submit(); }}
            placeholder={isSetup ? 'Create PIN' : 'Enter PIN'}
            className="w-full rounded-[14px] bg-[var(--fill)] border border-[var(--glass-border)] px-4 py-3 outline-none focus:border-accent"
          />
          {isSetup && (
            <input
              type="password" inputMode="numeric" value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="Confirm PIN"
              className="mt-3 w-full rounded-[14px] bg-[var(--fill)] border border-[var(--glass-border)] px-4 py-3 outline-none focus:border-accent"
            />
          )}
          {(localErr || error) && (
            <div className="mt-3 flex items-center gap-2 text-expense text-sm">
              <span>⚠</span>{localErr ?? error}
            </div>
          )}
          <button
            onClick={submit} disabled={busy}
            className="focus-ring mt-5 w-full rounded-btn bg-primary text-[var(--primary-fg)] font-semibold py-3 transition-shadow duration-[250ms] hover:shadow-[var(--glow)] disabled:opacity-60"
          >
            {busy ? 'Working…' : isSetup ? 'Create vault' : 'Unlock'}
          </button>
          {!isSetup && (
            <div className="mt-3 flex items-center justify-center gap-2 text-muted text-sm">
              <Fingerprint size={16} /> PIN secured with PBKDF2 + AES-256
            </div>
          )}
        </div>
        <ul className="mt-6 grid gap-2.5">
          {TRUST_POINTS.map((t) => (
            <li key={t.title} className="flex items-start gap-2.5 text-[12px] leading-snug">
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
