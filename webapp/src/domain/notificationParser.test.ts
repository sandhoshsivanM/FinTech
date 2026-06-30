import { describe, test, expect } from 'vitest';
import { fingerprintInput, parseNotification } from './notificationParser';

// Parity fixtures shared with test/unit/notification_parser_test.dart.
// `now` is pinned to local noon so the fallback timestamp is deterministic.
const NOW = new Date(2026, 5, 30, 12).getTime(); // local June 30 2026, noon

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
    expect(fingerprintInput(p!)).toBe('2026-01-05|1234.56|amazon');
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
