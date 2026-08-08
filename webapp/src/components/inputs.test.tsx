// DateInput and Combobox — the two controls that exist because their native
// equivalents cannot be formatted or themed.
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { DateInput } from './DateInput';
import { Combobox } from './Combobox';

beforeEach(cleanup);

/* -------------------------------------------------------------------------- */

function DateHarness({ initial = '' }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <div>
      <DateInput value={v} onChange={setV} aria-label="Date" />
      <output data-testid="value">{v}</output>
    </div>
  );
}

const box = () => screen.getByLabelText('Date') as HTMLInputElement;
const committed = () => screen.getByTestId('value').textContent;

describe('DateInput', () => {
  test('displays a stored yyyy-MM-dd value as dd/MM/yyyy', () => {
    render(<DateHarness initial="2026-08-08" />);
    expect(box().value).toBe('08/08/2026');
  });

  test('an unpadded, ambiguous date is read day-first', async () => {
    const user = userEvent.setup();
    render(<DateHarness />);
    await user.type(box(), '1/2/2026');
    await user.tab();
    // 1 February, not 2 January — the failure mode this control exists for.
    expect(committed()).toBe('2026-02-01');
    expect(box().value).toBe('01/02/2026');
  });

  test('accepts the forgiving formats the importer accepts', async () => {
    const user = userEvent.setup();
    for (const typed of ['08-08-2026', '8 Aug 2026']) {
      cleanup();
      render(<DateHarness />);
      await user.clear(box());
      await user.type(box(), typed);
      await user.tab();
      expect(committed()).toBe('2026-08-08');
    }
  });

  test('rubbish is rejected and the previous value restored', async () => {
    const user = userEvent.setup();
    render(<DateHarness initial="2026-08-08" />);
    await user.clear(box());
    await user.type(box(), 'not a date');
    await user.tab();
    expect(committed()).toBe('2026-08-08');
    expect(box().value).toBe('08/08/2026');
  });

  test('clearing the field clears the value', async () => {
    const user = userEvent.setup();
    render(<DateHarness initial="2026-08-08" />);
    await user.clear(box());
    await user.tab();
    expect(committed()).toBe('');
  });

  test('mid-typing is not fought by the parent', async () => {
    const user = userEvent.setup();
    render(<DateHarness />);
    await user.type(box(), '08/0');
    // Still uncommitted and still exactly what was typed.
    expect(box().value).toBe('08/0');
    expect(committed()).toBe('');
  });

  test('keeps a native picker available for mobile', () => {
    render(<DateHarness initial="2026-08-08" />);
    expect(screen.getByLabelText('Open calendar')).toBeInTheDocument();
    const native = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(native).toBeTruthy();
    expect(native.value).toBe('2026-08-08');
  });
});

/* -------------------------------------------------------------------------- */

const OPTIONS = ['Information Technology', 'Capital Goods', 'Chemicals', 'Commodities'];

function ComboHarness({ initial = '' }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <div>
      <Combobox value={v} onChange={setV} options={OPTIONS} aria-label="Sector" />
      <output data-testid="value">{v}</output>
    </div>
  );
}

describe('Combobox', () => {
  test('is a real combobox, so assistive tech and tests can drive it', () => {
    render(<ComboHarness />);
    const input = screen.getByRole('combobox', { name: 'Sector' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  test('opens on focus and lists every option', async () => {
    const user = userEvent.setup();
    render(<ComboHarness />);
    await user.click(screen.getByRole('combobox'));
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(OPTIONS.length);
  });

  test('filters as you type', async () => {
    const user = userEvent.setup();
    render(<ComboHarness />);
    await user.type(screen.getByRole('combobox'), 'chem');
    const opts = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(opts.map((o) => o.textContent)).toEqual(['Chemicals']);
  });

  test('matches a substring anywhere, not just a prefix', async () => {
    // "ch" is inside "Information Technology" too. Forgiving is the point:
    // you should not have to know how a sector name starts to find it.
    const user = userEvent.setup();
    render(<ComboHarness />);
    await user.type(screen.getByRole('combobox'), 'ch');
    const opts = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(opts.map((o) => o.textContent)).toEqual(['Information Technology', 'Chemicals']);
  });

  test('picking an option commits it', async () => {
    const user = userEvent.setup();
    render(<ComboHarness />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Capital Goods' }));
    expect(screen.getByTestId('value').textContent).toBe('Capital Goods');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  test('keyboard traversal selects', async () => {
    const user = userEvent.setup();
    render(<ComboHarness />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByTestId('value').textContent).toBe('Capital Goods');
  });

  test('free text is kept — the list is a convenience, not a constraint', async () => {
    const user = userEvent.setup();
    render(<ComboHarness />);
    await user.type(screen.getByRole('combobox'), 'Shipbuilding');
    expect(screen.getByTestId('value').textContent).toBe('Shipbuilding');
  });

  test('no list is drawn when nothing matches', async () => {
    const user = userEvent.setup();
    render(<ComboHarness />);
    await user.type(screen.getByRole('combobox'), 'zzzz');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  test('Escape closes the list without clearing the value', async () => {
    const user = userEvent.setup();
    render(<ComboHarness initial="Chemicals" />);
    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByTestId('value').textContent).toBe('Chemicals');
  });
});
