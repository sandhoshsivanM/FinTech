// Mobile-number sign-in: the checks and wording the sign-in page uses.

/** Indian mobiles are 10 digits starting 6 to 9. The server checks again; this only saves a round trip. */
export function nationalNumber(input: string): string {
  return input.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
}

export const isValidIndianMobile = (digits: string) => /^[6-9]\d{9}$/.test(digits);

export const toE164 = (digits: string) => `+91${digits}`;

export const isCode = (code: string) => /^\d{6}$/.test(code);

type Problem = { status?: number; code?: string; retryAfter?: number };

/** Plain words for what the server can answer to "send a code" or "check this code". */
export function phoneProblem(err: unknown, fallback: (e: unknown) => string): string {
  const p = err as Problem;
  switch (p?.code) {
    case 'invalid_phone':
      return 'Enter a valid 10-digit Indian mobile number.';
    case 'too_many_requests': {
      const minutes = p.retryAfter ? Math.ceil(p.retryAfter / 60) : undefined;
      if (p.retryAfter && p.retryAfter <= 60) return `Please wait ${p.retryAfter} seconds before asking for another code.`;
      return `Too many codes were asked for. Try again in ${minutes ? `${minutes} minute${minutes === 1 ? '' : 's'}` : 'a while'}.`;
    }
    case 'invalid_grant':
      return 'That code isn’t right, or it has expired. Check it, or ask for a new code.';
    case 'temporarily_unavailable':
      return 'The code could not be sent right now. Try again in a moment.';
    case 'unsupported_provider':
      return 'Signing in with a mobile number isn’t available here. Use a passkey or Google instead.';
    case 'account_deletion_pending':
      return 'This account is being deleted. Sign in again within 24 hours of asking to cancel the deletion.';
    default:
      return fallback(err);
  }
}
