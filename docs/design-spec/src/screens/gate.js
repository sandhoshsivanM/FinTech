/** The vault gate — the only screen outside the shell. */
import * as K from '../kit.js';
import { icon } from '../icons.js';

const MARK = '../../assets/brand/khazana-mark.png';

const TRUST = [
  ['100% private', 'No server. No tracking.'],
  ['Encrypted', 'AES-256 at rest. PIN never leaves the device.'],
  ['Offline first', 'Works everywhere. No internet required.'],
];

/** The gate is a centred card on the plain canvas — no sidebar, no topbar. */
function gate({ setup }) {
  return `<div style="height:100%;display:flex;align-items:center;justify-content:center;padding:24px;
    background:var(--canvas);color:var(--ink);font-family:'Inter',sans-serif;font-size:14px;
    letter-spacing:-0.006em;font-variant-numeric:tabular-nums">
    <div style="width:384px">
      <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:32px">
        <img src="${MARK}" width="96" height="96" style="object-fit:contain" alt="">
        <span style="margin-top:20px;font-size:26px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:var(--ink)">Khazana</span>
        <p style="margin:10px 0 0;display:flex;align-items:center;gap:12px;font-size:11.5px;font-weight:600;
          letter-spacing:0.16em;text-transform:uppercase;color:var(--gold-ink)">
          <span style="height:1px;width:24px;background:var(--gold);opacity:.45;display:block"></span>
          Your wealth. Your vault.
          <span style="height:1px;width:24px;background:var(--gold);opacity:.45;display:block"></span>
        </p>
      </div>

      <div class="card" style="padding:24px">
        <h2 style="margin:0 0 ${setup ? '6' : '16'}px;font-size:18px;font-weight:700;letter-spacing:-0.025em;color:var(--ink)">
          ${setup ? 'Set up your vault' : 'Unlock'}</h2>
        ${setup ? `<p style="margin:0 0 16px;font-size:13.5px;color:var(--muted);line-height:1.55">
          Your PIN encrypts everything in this browser. It is never stored.</p>` : ''}

        <div style="display:flex;align-items:center;gap:10px;width:100%;height:48px;padding:0 16px;
          border-radius:14px;background:var(--fill);border:1px solid var(--accent);color:var(--ink);
          box-shadow:0 0 0 3px var(--accent-line);letter-spacing:.35em;font-size:16px">••••</div>

        ${setup ? `<div style="display:flex;align-items:center;gap:10px;width:100%;height:48px;padding:0 16px;margin-top:10px;
          border-radius:14px;background:var(--fill);border:1px solid var(--glass-border);color:var(--muted);font-size:14px">Confirm PIN</div>` : ''}

        <div style="margin-top:16px">${K.button(setup ? 'Create vault' : 'Unlock', 'primary', { full: true, icon: icon('lock', 15) })}</div>

        ${setup ? '' : `<div style="margin-top:10px">${K.button('Use biometrics', 'secondary', { full: true, icon: icon('fingerprint-pattern', 15) })}</div>`}

        <p style="margin:16px 0 0;display:flex;gap:9px;font-size:11.5px;color:var(--muted);line-height:1.55">
          <span style="flex:none;color:var(--success);margin-top:1px">${icon('shield-check', 14)}</span>
          ${setup
            ? 'There is no recovery. If the PIN is lost the vault cannot be opened — by you or by anyone.'
            : 'Five wrong attempts start a cooldown. The vault stays encrypted throughout.'}
        </p>
      </div>

      <div style="display:flex;gap:20px;margin-top:28px">
        ${TRUST.map(([t, d]) => `
          <div style="flex:1;min-width:0">
            <div style="font-size:11.5px;font-weight:700;color:var(--ink)">${t}</div>
            <div style="font-size:10.5px;color:var(--muted);margin-top:3px;line-height:1.45">${d}</div>
          </div>`).join('')}
      </div>
    </div>
  </div>`;
}

export default [
  {
    art: gate({ setup: false }),
    meta: {
      name: 'Vault gate', route: '/ · unlock', height: 900,
      purpose: `The first thing a returning user sees and the last thing an attacker does. No shell,
        no navigation, nothing to explore — the whole app is behind this card until the PIN derives
        a working key.`,
      notes: [
        `<b>The mark at 96px.</b> This is the one screen where the brand is the largest object; it is
         also the only place gold appears at size, since gold is identity and never interaction.`,
        `<b>PIN field is 48px and 14px-radius</b>, larger than the 38px form input elsewhere — the
         only field on screen deserves the larger target.`,
        `<b>Biometrics is secondary, not primary.</b> The PIN is what derives the key; the platform
         authenticator only releases a stored one, so the emerald sits on the PIN path.`,
        `<b>The consequence is stated up front.</b> “No recovery” belongs on the setup screen, not in
         a support article discovered later.`,
      ],
      specs: [['Card width', '384px'], ['Card padding', '24px'], ['Mark', '96px'], ['Wordmark tracking', '0.22em'], ['PIN field', '48px h, 14px r'], ['Focus ring', '3px accent-line'], ['Lockout', '5 attempts']],
      themeNote: 'The gate is also the strongest theme test: it is almost entirely surface, brand and one field.',
    },
  },
];
