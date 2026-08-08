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

  test('accepts the forgiving numeric formats', async () => {
    // Named months ("8 Aug 2026") are no longer typeable: date fields now
    // reject letters outright. Files still parse them — see parseDateCell.
    const user = userEvent.setup();
    for (const typed of ['08-08-2026', '8/8/2026', '08.08.2026']) {
      cleanup();
      render(<DateHarness />);
      await user.clear(box());
      await user.type(box(), typed);
      await user.tab();
      expect(committed()).toBe('2026-08-08');
    }
  });

  test('letters cannot be typed into a date field at all', async () => {
    const user = userEvent.setup();
    render(<DateHarness initial="2026-08-08" />);
    await user.clear(box());
    await user.type(box(), 'not a date');
    // Nothing survived the filter, so the field is simply empty.
    expect(box().value).toBe('');
  });

  test('an impossible date is rejected and the previous value restored', async () => {
    // 99/99/9999 passes the character filter but is not a day.
    const user = userEvent.setup();
    render(<DateHarness initial="2026-08-08" />);
    await user.clear(box());
    await user.type(box(), '99/99/9999');
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

describe('DateInput — in-app calendar', () => {
  test('the calendar button opens a styled popover, not the OS picker', async () => {
    const user = userEvent.setup();
    render(<DateHarness initial="2026-08-09" />);
    await user.click(screen.getByLabelText('Open calendar'));

    const dialog = screen.getByRole('dialog', { name: 'Choose a date' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('August 2026')).toBeInTheDocument();
  });

  test('picking a day commits it in dd/MM/yyyy', async () => {
    const user = userEvent.setup();
    render(<DateHarness initial="2026-08-09" />);
    await user.click(screen.getByLabelText('Open calendar'));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '15' }));

    expect(committed()).toBe('2026-08-15');
    expect(box().value).toBe('15/08/2026');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('month navigation moves the grid', async () => {
    const user = userEvent.setup();
    render(<DateHarness initial="2026-08-09" />);
    await user.click(screen.getByLabelText('Open calendar'));
    await user.click(screen.getByLabelText('Previous month'));
    expect(screen.getByText('July 2026')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Next month'));
    await user.click(screen.getByLabelText('Next month'));
    expect(screen.getByText('September 2026')).toBeInTheDocument();
  });

  test('Clear empties the field', async () => {
    const user = userEvent.setup();
    render(<DateHarness initial="2026-08-09" />);
    await user.click(screen.getByLabelText('Open calendar'));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(committed()).toBe('');
  });

  test('Escape closes it without changing the value', async () => {
    const user = userEvent.setup();
    render(<DateHarness initial="2026-08-09" />);
    await user.click(screen.getByLabelText('Open calendar'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(committed()).toBe('2026-08-09');
  });

  test('days outside min/max cannot be chosen', async () => {
    function Bounded() {
      const [v, setV] = useState('2026-08-09');
      return <DateInput value={v} onChange={setV} max="2026-08-10" aria-label="Date" />;
    }
    const user = userEvent.setup();
    render(<Bounded />);
    await user.click(screen.getByLabelText('Open calendar'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: '20' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: '9' })).not.toBeDisabled();
  });
});

describe('DateInput — bare variant', () => {
  test('drops the field chrome so it can sit inside an existing pill', () => {
    const { container } = render(
      <DateInput bare value="2026-08-08" onChange={() => {}} aria-label="As on" />,
    );
    const input = screen.getByLabelText('As on');
    // No second border or background to nest inside the surrounding control.
    expect(input.className).not.toMatch(/border-\[var\(--line\)\]/);
    expect(input.className).not.toMatch(/rounded-xl/);
    // Still one calendar trigger, not zero and not two.
    expect(container.querySelectorAll('button[aria-label="Open calendar"]')).toHaveLength(1);
  });

  test('still formats and commits exactly like the full field', async () => {
    function Bare() {
      const [v, setV] = useState('2026-08-08');
      return (
        <div>
          <DateInput bare value={v} onChange={setV} aria-label="As on" />
          <output data-testid="value">{v}</output>
        </div>
      );
    }
    const user = userEvent.setup();
    render(<Bare />);
    const input = screen.getByLabelText('As on') as HTMLInputElement;
    expect(input.value).toBe('08/08/2026');

    await user.clear(input);
    await user.type(input, '15/09/2026');
    await user.tab();
    expect(screen.getByTestId('value').textContent).toBe('2026-09-15');
  });

  test('the full variant keeps its chrome', () => {
    render(<DateInput value="2026-08-08" onChange={() => {}} aria-label="Date" />);
    expect(screen.getByLabelText('Date').className).toMatch(/rounded-xl/);
  });
});
