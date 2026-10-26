import { beforeEach, describe, expect, test, vi } from 'vitest';
import { pollMacSms, setMacSmsEnabled, useMacSms, FIRST_READ_DAYS, SENDER_KEYWORDS } from './macSms';

const msg = (rowid: number) => ({ rowid, sender: 'AX-HDFCBK', text: `Rs ${rowid} debited`, receivedAt: 1000 + rowid });

beforeEach(() => {
  localStorage.clear();
  useMacSms.setState({ enabled: false, cursor: 0, since: 0, status: 'off', lastRunAt: null, lastAdded: 0 });
});

describe('pollMacSms', () => {
  test('does nothing while switched off', async () => {
    const invoke = vi.fn();
    expect(await pollMacSms(vi.fn(), invoke)).toBe(0);
    expect(invoke).not.toHaveBeenCalled();
  });

  test('first enable reads back a bounded window, not all history', () => {
    const before = Date.now();
    setMacSmsEnabled(true);
    const { since } = useMacSms.getState();
    expect(since).toBeGreaterThanOrEqual(before - FIRST_READ_DAYS * 86_400_000);
    expect(since).toBeLessThanOrEqual(Date.now() - FIRST_READ_DAYS * 86_400_000 + 1000);
  });

  test('queues each page, advances and persists the cursor, and stops when caught up', async () => {
    setMacSmsEnabled(true);
    const pages = [
      { messages: [msg(1), msg(2)], cursor: 500 },
      { messages: [], cursor: 640 }, // a page of personal chats: nothing matched, cursor still moves
      { messages: [], cursor: 640 },
    ];
    const invoke = vi.fn(async () => pages.shift());
    const addCaptures = vi.fn(async () => ['added', 'duplicate'] as ('added' | 'duplicate')[]);

    expect(await pollMacSms(addCaptures, invoke)).toBe(1);
    expect(addCaptures).toHaveBeenCalledTimes(1);
    expect(addCaptures).toHaveBeenCalledWith([
      { text: 'Rs 1 debited', sender: 'AX-HDFCBK', source: 'sms', receivedAt: 1001 },
      { text: 'Rs 2 debited', sender: 'AX-HDFCBK', source: 'sms', receivedAt: 1002 },
    ]);
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke).toHaveBeenLastCalledWith('read_bank_messages', expect.objectContaining({ sinceRowid: 640, keywords: SENDER_KEYWORDS }));
    expect(useMacSms.getState()).toMatchObject({ cursor: 640, status: 'idle', lastAdded: 1 });
    expect(JSON.parse(localStorage.getItem('khazana-mac-sms')!).cursor).toBe(640);
  });

  test('a failed write leaves the cursor where it was, so the page is read again', async () => {
    setMacSmsEnabled(true);
    const invoke = vi.fn(async () => ({ messages: [msg(7)], cursor: 9 }));
    const addCaptures = vi.fn(async () => { throw new Error('disk full'); });
    await pollMacSms(addCaptures, invoke);
    expect(useMacSms.getState()).toMatchObject({ cursor: 0, status: 'error' });
  });

  test('missing Full Disk Access is reported as such', async () => {
    setMacSmsEnabled(true);
    await pollMacSms(vi.fn(), vi.fn(async () => { throw 'no_access'; }));
    expect(useMacSms.getState().status).toBe('no_access');
  });

  test('the cursor is never stored in a form that carries message text', async () => {
    setMacSmsEnabled(true);
    await pollMacSms(vi.fn(async () => ['added' as const]), vi.fn(async () => ({ messages: [msg(3)], cursor: 3 })));
    expect(localStorage.getItem('khazana-mac-sms')).not.toMatch(/debited/);
  });
});
