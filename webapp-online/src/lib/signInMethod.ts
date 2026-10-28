// How this browser signed in, kept only to word things honestly. A mobile number
// can sign in but cannot approve removing a device (ADR 0004), so the Devices
// page explains that up front instead of showing a passkey error. Nothing here
// is a secret and the server decides everything that matters.

const METHOD = 'khazana-signin-method';
const OFFER = 'khazana-passkey-offer';

/** The offer to add a passkey stays valid while the server still allows it (10 minutes, a little less here). */
export const OFFER_WINDOW_MS = 9 * 60 * 1000;

const store = () => (typeof localStorage === 'undefined' ? undefined : localStorage);

export type SignInMethod = 'phone' | 'other';

export function rememberSignIn(method: SignInMethod, now = Date.now()): void {
  const s = store();
  if (!s) return;
  s.setItem(METHOD, method);
  if (method === 'phone') s.setItem(OFFER, String(now));
  else s.removeItem(OFFER);
}

export function signInMethod(): SignInMethod | undefined {
  const v = store()?.getItem(METHOD);
  return v === 'phone' || v === 'other' ? v : undefined;
}

/** True while a phone sign-in is fresh enough that a passkey can still be added. */
export function passkeyOfferOpen(now = Date.now()): boolean {
  const at = Number(store()?.getItem(OFFER));
  return Number.isFinite(at) && at > 0 && now - at < OFFER_WINDOW_MS;
}

export function closePasskeyOffer(): void {
  store()?.removeItem(OFFER);
}

/** A passkey now exists for this account (added here), so removing a device can be approved. */
export function notePasskeyAdded(): void {
  closePasskeyOffer();
  store()?.setItem(METHOD, 'other');
}

export function forgetSignIn(): void {
  store()?.removeItem(METHOD);
  store()?.removeItem(OFFER);
}
