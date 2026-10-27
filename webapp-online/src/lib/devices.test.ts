import { describe, expect, test, vi } from 'vitest';
import { Devices, ago, platformLabel } from './devices';

function fake() {
  const call = vi.fn(async () => undefined as never);
  const callWithStepUp = vi.fn(async () => undefined as never);
  return { devices: new Devices({ call, callWithStepUp }), call, callWithStepUp };
}

describe('Devices', () => {
  test('lists from the gateway', async () => {
    const { devices, call } = fake();
    await devices.list();
    expect(call).toHaveBeenCalledWith('GET', '/v1/devices/');
  });

  test('rename trims, caps the length and PATCHes the device', async () => {
    const { devices, call } = fake();
    await devices.rename('d 1', `  ${'x'.repeat(100)}  `);
    expect(call).toHaveBeenCalledWith('PATCH', '/v1/devices/d%201', { name: 'x'.repeat(64) });
  });

  test('rename refuses an empty name without calling the server', () => {
    const { devices, call } = fake();
    expect(() => devices.rename('d1', '   ')).toThrow('Give the device a name.');
    expect(call).not.toHaveBeenCalled();
  });

  test('removing goes through the passkey step-up, never the plain call', async () => {
    const { devices, call, callWithStepUp } = fake();
    await devices.remove('d1');
    expect(callWithStepUp).toHaveBeenCalledWith('DELETE', '/v1/devices/d1');
    expect(call).not.toHaveBeenCalled();
  });
});

describe('labels', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  test('ago reads naturally', () => {
    expect(ago('2026-10-26T11:59:40Z', now)).toBe('just now');
    expect(ago('2026-10-26T11:59:00Z', now)).toBe('1 minute ago');
    expect(ago('2026-10-26T09:00:00Z', now)).toBe('3 hours ago');
    expect(ago('2026-10-23T12:00:00Z', now)).toBe('3 days ago');
    expect(ago('nonsense', now)).toBe('unknown');
  });
  test('platform names', () => {
    expect(platformLabel('web')).toBe('Web browser');
    expect(platformLabel('ios')).toBe('iPhone / iPad');
    expect(platformLabel('toaster')).toBe('toaster');
  });
});
