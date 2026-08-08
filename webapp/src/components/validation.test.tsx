// Input constraints. `inputMode` is only a keyboard hint — it never stopped a
// letter reaching a money field, and `type="number"` silently blanks a value
// the browser dislikes. These pin the real filtering.
import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { NumberInput, sanitizeNumeric } from './NumberInput';
import { maskDate } from './DateInput';

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

describe('maskDate', () => {
  test('letters and symbols never enter a date field', () => {
    expect(maskDate('abc', false)).toBe('');
    expect(maskDate('0!8@0#8', false)).toBe('08/08/');
  });

  test('slashes are inserted as you type', () => {
    expect(maskDate('0', false)).toBe('0');
    expect(maskDate('08', false)).toBe('08/');
    expect(maskDate('0808', false)).toBe('08/08/');
    expect(maskDate('08082026', false)).toBe('08/08/2026');
  });

  test('it stops at eight digits', () => {
    expect(maskDate('0808202699', false)).toBe('08/08/2026');
  });

  test('deleting does not re-add the separator it is erasing', () => {
    // Without this, backspace fights the mask and the slash cannot be removed.
    expect(maskDate('08', true)).toBe('08');
    expect(maskDate('0808', true)).toBe('08/08');
  });
});
