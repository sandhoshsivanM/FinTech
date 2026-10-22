/**
 * Twin of test/unit/notification_parser_test.dart. The fixture-driven block
 * loads __fixtures__/parser_cases.json, which both suites must agree on.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test, expect } from 'vitest';
import { MAX_LENGTH, fingerprintInput, parseNotification } from '@khazana/domain/notificationParser';

// `now` is pinned to local noon so the fallback timestamp is deterministic.
const NOW = new Date(2026, 5, 30, 12).getTime(); // local June 30 2026, noon

const FIXTURE_PATH = resolve(__dirname, '__fixtures__/parser_cases.json');
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

describe('notificationParser', () => {
  test('debit SMS: amount, merchant, embedded date; balance is ignored', () => {
    const p = parseNotification(
      'Rs.1,234.56 debited from a/c XX1234 at AMAZON on 05-Jan-2026. Avl Bal Rs.45,000.00',
      { now: NOW },
    );
    expect(p).not.toBeNull();
    expect(p!.type).toBe('expense');
    expect(p!.amount.toString()).toBe('1234.56'); // not the ₹45,000 balance
    expect(p!.merchant).toBe('amazon');
    expect(p!.timestamp).toBe('2026-01-05');
    expect(p!.uncategorized).toBe(false);
    expect(p!.profileId).toBeNull();
    expect(p!.accountLast4).toBe('1234');
    expect(p!.availableBalance!.toString()).toBe('45000');
    // No reference number, so the balance is what keeps this key unique.
    expect(fingerprintInput(p!)).toBe('2026-01-05|1234.56|amazon|1234|45000');
  });

  test('credit SMS: income, sender-matched bank profile, fallback timestamp', () => {
    const p = parseNotification(
      'INR 50000 credited to SALARY. Available Balance: INR 1,20,000',
      { now: NOW, sender: 'VK-HDFCBK' },
    );
    expect(p).not.toBeNull();
    expect(p!.type).toBe('income');
    expect(p!.amount.toString()).toBe('50000');
    expect(p!.merchant).toBe('salary');
    expect(p!.timestamp).toBe('2026-06-30'); // no embedded date → SMS arrival day
    expect(p!.profileId).toBe('hdfc');
    expect(p!.uncategorized).toBe(false);
  });

  test('UPI spend: merchant before "using"', () => {
    const p = parseNotification('You spent Rs 450 at BIGBASKET using UPI. Avl Bal Rs 9550', { now: NOW });
    expect(p).not.toBeNull();
    expect(p!.amount.toString()).toBe('450');
    expect(p!.merchant).toBe('bigbasket');
    expect(p!.uncategorized).toBe(false);
  });

  test('no merchant → uncategorized fallback flag is set', () => {
    const p = parseNotification('Rs 200 withdrawn from ATM', { now: NOW });
    expect(p).not.toBeNull();
    expect(p!.type).toBe('expense');
    expect(p!.amount.toString()).toBe('200');
    expect(p!.merchant).toBe('');
    expect(p!.uncategorized).toBe(true);
  });

  test('non-financial message → null', () => {
    const p = parseNotification('OTP 123456 for your login. Do not share.', { now: NOW });
    expect(p).toBeNull();
  });
});

describe('notificationParser — hostile input', () => {
  // Attacker-controlled text: each probe is slow against a pattern with
  // adjacent `\s*` groups; collapsing whitespace first keeps every pattern linear.
  const probes: Record<string, string> = {
    'spaces after a balance keyword': `debited balance${' '.repeat(1900)}x`,
    'spaces after an account keyword': `debited a/c${' '.repeat(1900)}x`,
    'spaces after a reference keyword': `debited rs 5 ref${' '.repeat(1900)}x`,
    'many merchant keywords, no terminator': `debited rs 5 ${'to a '.repeat(390)}`,
  };
  for (const [name, text] of Object.entries(probes)) {
    test(`${name} parses in linear time`, () => {
      const start = performance.now();
      parseNotification(text, { now: NOW });
      expect(performance.now() - start).toBeLessThan(200);
    });
  }

  test('anything longer than a bank alert is rejected outright', () => {
    const long = `Rs 100 debited from a/c XX1234. ${'x'.repeat(MAX_LENGTH)}`;
    expect(parseNotification(long, { now: NOW })).toBeNull();
  });
});

describe('notificationParser — shared fixture', () => {
  test('the two copies of the fixture are byte-identical', () => {
    // Vitest cannot import from outside webapp/, so the file is duplicated
    // rather than symlinked. Duplicated files drift; this is what stops it.
    // If this fails, copy test/fixtures/parser_cases.json over
    // webapp/src/domain/__fixtures__/parser_cases.json.
    const dart = readFileSync(resolve(__dirname, '../../../test/fixtures/parser_cases.json'));
    const web = readFileSync(FIXTURE_PATH);
    expect(web.equals(dart)).toBe(true);
  });

  const fixedNow = Date.parse(fixture.now as string);
  for (const c of fixture.cases as Record<string, unknown>[]) {
    test(c.name as string, () => {
      const p = parseNotification(c.text as string, { now: fixedNow, sender: c.sender as string });
      const expected = c.expect as Record<string, unknown> | null;
      if (expected === null) {
        expect(p).toBeNull();
        return;
      }
      expect(p).not.toBeNull();
      const actual: Record<string, unknown> = {
        type: p!.type,
        kind: p!.kind,
        amount: p!.amount.toString(),
        merchant: p!.merchant,
        timestamp: p!.timestamp,
        utr: p!.utr,
        accountLast4: p!.accountLast4,
        availableBalance: p!.availableBalance?.toString() ?? null,
        instrument: p!.instrument,
        profileId: p!.profileId,
        fingerprint: fingerprintInput(p!),
      };
      for (const [key, value] of Object.entries(expected)) {
        expect({ key, value: actual[key] }).toEqual({ key, value });
      }
    });
  }
});
