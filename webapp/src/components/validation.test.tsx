// Input constraints. `inputMode` is only a keyboard hint — it never stopped a
// letter reaching a money field, and `type="number"` silently blanks a value
// the browser dislikes. These pin the real filtering.
import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { NumberInput, sanitizeNumeric } from './NumberInput';
import { filterDateChars } from './DateInput';

beforeEach(cleanup);

describe('sanitizeNumeric', () => {
  test('strips letters and symbols', () => {
    expect(sanitizeNumeric('12a3!b', false, 2)).toBe('123');
    expect(sanitizeNumeric('abc', false, 2)).toBe('');
    expect(sanitizeNumeric('₹1,234.56', false, 2)).toBe('1234.56');
  });

  test('keeps a single decimal point', () => {
    // A fumbled key should not blank the field, which is what type=number does.
    expect(sanitizeNumeric('1.2.3', false, 2)).toBe('1.23');
  });

  test('respects the decimal limit', () => {
    expect(sanitizeNumeric('1.239', false, 2)).toBe('1.23');
    expect(sanitizeNumeric('1.5', false, 0)).toBe('15');
  });

  test('half-typed input survives, so the cursor is never fought', () => {
    expect(sanitizeNumeric('1.', false, 2)).toBe('1.');
    expect(sanitizeNumeric('-', true, 2)).toBe('-');
    expect(sanitizeNumeric('', false, 2)).toBe('');
  });

  test('a minus is only honoured when allowed, and only in front', () => {
    expect(sanitizeNumeric('-50', true, 2)).toBe('-50');
    expect(sanitizeNumeric('-50', false, 2)).toBe('50');
    expect(sanitizeNumeric('5-0', true, 2)).toBe('50');
  });
});

describe('NumberInput', () => {
  function Harness() {
    const [v, setV] = useState('');
    return (
      <div>
        <NumberInput value={v} onChange={setV} aria-label="Amount" />
        <output data-testid="value">{v}</output>
      </div>
    );
  }

  test('typing letters into an amount does nothing', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Amount'), 'abc');
    expect(screen.getByTestId('value').textContent).toBe('');
  });

  test('a mixed string keeps only the number', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Amount'), '1a2b3');
    expect(screen.getByTestId('value').textContent).toBe('123');
  });

  test('pasting a statement figure is cleaned, not rejected', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText('Amount'));
    await user.paste('₹1,234.56');
    expect(screen.getByTestId('value').textContent).toBe('1234.56');
  });
});

describe('filterDateChars', () => {
  test('letters and symbols never enter a date field', () => {
    expect(filterDateChars('abc')).toBe('');
    expect(filterDateChars('0!8@0#8')).toBe('0808');
    expect(filterDateChars('08/08/2026abc')).toBe('08/08/2026');
  });

  test('separators the user typed are preserved, not reflowed', () => {
    // Reformatting every keystroke turned "1/2/2026" into "12/20/26" — a
    // different day from valid input. Filtering must not rewrite.
    expect(filterDateChars('1/2/2026')).toBe('1/2/2026');
    expect(filterDateChars('08-08-2026')).toBe('08-08-2026');
    expect(filterDateChars('08.08.2026')).toBe('08.08.2026');
  });

  test('length is capped at a full date', () => {
    expect(filterDateChars('08/08/2026999')).toHaveLength(10);
  });
});
