// The PIN screen's way into the "Try demo" vault, and what a demo tab shows
// instead of a PIN field.
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const fake = vi.hoisted(() => ({ name: 'fintech_os' }));
vi.mock('@/lib/db', () => ({
  DEMO_DB_NAME: 'fintech_os_demo',
  db: { get name() { return fake.name; } },
  requestPersistence: vi.fn(async () => 'denied'),
  persistenceState: vi.fn(async () => 'denied'),
}));
vi.mock('@/lib/demoVault', () => ({
  openDemoVault: vi.fn(async () => undefined),
  exitDemo: vi.fn(async () => undefined),
}));
vi.mock('@/lib/crypto', async (orig) => ({
  ...(await orig<typeof import('@/lib/crypto')>()),
  cryptoAvailable: () => true,
}));

const { useApp } = await import('@/lib/store');
const { VaultGate } = await import('./VaultGate');
const { openDemoVault, exitDemo } = await import('@/lib/demoVault');

const DEMO_LINK = /Just looking\? Open the demo with sample data/;

beforeEach(() => {
  fake.name = 'fintech_os';
  vi.mocked(openDemoVault).mockClear();
  vi.mocked(exitDemo).mockClear();
  useApp.setState({ status: 'locked', error: null, strandedRecords: 0 });
});

describe('VaultGate demo link', () => {
  test('the lock screen links to /demo/', () => {
    render(<VaultGate />);
    expect(screen.getByRole('link', { name: DEMO_LINK })).toHaveAttribute('href', '/demo/');
    expect(screen.getByPlaceholderText('Enter PIN')).toBeInTheDocument();
  });

  test('the setup screen links to /demo/', () => {
    useApp.setState({ status: 'uninitialized' });
    render(<VaultGate />);
    expect(screen.getByRole('link', { name: DEMO_LINK })).toHaveAttribute('href', '/demo/');
  });

  test('not offered over stranded data, where the screen is about recovery', () => {
    useApp.setState({ status: 'uninitialized', strandedRecords: 3 });
    render(<VaultGate />);
    expect(screen.queryByRole('link', { name: DEMO_LINK })).toBeNull();
  });
});

describe('VaultGate in a demo tab', () => {
  beforeEach(() => { fake.name = 'fintech_os_demo'; });

  test('shows no PIN field, says it is a demo, and reopens without one', () => {
    render(<VaultGate />);
    expect(screen.queryByPlaceholderText('Enter PIN')).toBeNull();
    expect(screen.getByText('Sample data only. Starts fresh each visit.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen the demo' }));
    expect(openDemoVault).toHaveBeenCalledOnce();
  });

  test('offers the way out', () => {
    render(<VaultGate />);
    fireEvent.click(screen.getByRole('button', { name: 'Exit demo' }));
    expect(exitDemo).toHaveBeenCalledOnce();
  });
});
