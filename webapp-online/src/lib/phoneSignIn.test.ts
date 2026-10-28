// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { isCode, isValidIndianMobile, nationalNumber, phoneProblem, toE164 } from './phoneSignIn';
import { closePasskeyOffer, notePasskeyAdded, OFFER_WINDOW_MS, passkeyOfferOpen, rememberSignIn, signInMethod, forgetSignIn } from './signInMethod';
import { removalNeedsPasskey } from './devices';

const fallback = () => 'fallback';

describe('phone numbers', () => {
  test.each([
    ['98765 43210', '9876543210'],
    ['+91 98765-43210', '9876543210'],
    ['919876543210', '9876543210'],
    ['09876543210', '9876543210'],
    ['(98765) 43210', '9876543210'],
  ])('%s becomes the 10 national digits', (input, digits) => expect(nationalNumber(input)).toBe(digits));

  test('only 10 digits starting 6 to 9 are Indian mobiles', () => {
    expect(isValidIndianMobile('9876543210')).toBe(true);
    expect(isValidIndianMobile('5876543210')).toBe(false);
    expect(isValidIndianMobile('987654321')).toBe(false);
    expect(isValidIndianMobile('98765432101')).toBe(false);
    expect(toE164('9876543210')).toBe('+919876543210');
  });

  test('a code is exactly six digits', () => {
    expect(isCode('123456')).toBe(true);
    expect(isCode('12345')).toBe(false);
    expect(isCode('12345a')).toBe(false);
  });
});

describe('the words for what went wrong', () => {
  test.each([
    ['invalid_phone', 'valid 10-digit'],
    ['invalid_grant', 'isn’t right, or it has expired'],
    ['temporarily_unavailable', 'could not be sent'],
    ['unsupported_provider', 'isn’t available here'],
  ])('%s', (code, text) => expect(phoneProblem({ code }, fallback)).toContain(text));

  test('rate limits say how long to wait', () => {
    expect(phoneProblem({ code: 'too_many_requests', retryAfter: 20 }, fallback)).toContain('20 seconds');
    expect(phoneProblem({ code: 'too_many_requests', retryAfter: 600 }, fallback)).toContain('10 minutes');
    expect(phoneProblem({ code: 'too_many_requests' }, fallback)).toContain('a while');
  });

  test('anything else falls back', () => expect(phoneProblem(new TypeError('x'), fallback)).toBe('fallback'));
});

describe('how this browser signed in', () => {
  test('a phone sign-in opens the passkey offer for a few minutes only', () => {
    forgetSignIn();
    rememberSignIn('phone', 1_000);
    expect(signInMethod()).toBe('phone');
    expect(passkeyOfferOpen(1_000 + OFFER_WINDOW_MS - 1)).toBe(true);
    expect(passkeyOfferOpen(1_000 + OFFER_WINDOW_MS + 1)).toBe(false);
  });

  test('adding a passkey ends the offer and the phone-only state', () => {
    rememberSignIn('phone');
    notePasskeyAdded();
    expect(passkeyOfferOpen()).toBe(false);
    expect(signInMethod()).toBe('other');
  });

  test('another sign-in method never offers it, and Not now closes it', () => {
    rememberSignIn('other');
    expect(passkeyOfferOpen()).toBe(false);
    rememberSignIn('phone');
    closePasskeyOffer();
    expect(passkeyOfferOpen()).toBe(false);
    forgetSignIn();
    expect(signInMethod()).toBeUndefined();
  });
});

describe('removing a device without a passkey', () => {
  const cancelled = Object.assign(new Error('x'), { name: 'NotAllowedError' });
  const refused = Object.assign(new Error('x'), { status: 400 });

  test('is explained for phone-only sign-ins when the passkey step fails', () => {
    expect(removalNeedsPasskey(cancelled, true)).toBe(true);
    expect(removalNeedsPasskey(refused, true)).toBe(true);
  });

  test('is left alone otherwise', () => {
    expect(removalNeedsPasskey(cancelled, false)).toBe(false);
    expect(removalNeedsPasskey(Object.assign(new Error('x'), { status: 503 }), true)).toBe(false);
    expect(removalNeedsPasskey(new TypeError('network'), true)).toBe(false);
  });
});
