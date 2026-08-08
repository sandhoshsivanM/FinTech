'use client';
/**
 * A field that only ever holds a number.
 *
 * `inputMode="decimal"` was doing this job and it does not do it: it is a hint
 * about which on-screen keyboard to raise, nothing more. On a desktop keyboard
 * — and on any phone with a hardware or third-party keyboard — you could type
 * "abc" into an amount, and the value went straight to `parseFloat`/`Decimal`
 * as garbage.
 *
 * `type="number"` is not the answer either: it silently discards a value the
 * browser considers invalid (so `.value` reads empty for "1.2.3"), its spinner
 * arrows scroll the figure on an accidental wheel over the field, and its
 * localisation of the decimal separator differs by locale.
 *
 * So the value is kept as text and filtered on the way in — the field cannot
 * be made to hold a non-number, and what the user typed is never silently
 * reinterpreted.
 */
import { useId, type InputHTMLAttributes } from 'react';

export interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: string;
  onChange: (value: string) => void;
  /** Allow a leading minus. Off by default: money fields carry sign elsewhere. */
  allowNegative?: boolean;
  /** Digits after the point. 0 makes it integer-only (quantities, PINs). */
  decimals?: number;
}

/**
 * Keeps only what can still become a number.
 *
 * Applied per keystroke, so it must tolerate half-finished input: "1." and "-"
 * are both legal on the way to something valid and are left alone rather than
 * being rewritten under the cursor.
 */
export function sanitizeNumeric(raw: string, allowNegative: boolean, decimals: number): string {
  let s = raw.replace(/[^0-9.\-]/g, '');

  // A minus sign only means anything in front.
  if (allowNegative) {
    const neg = s.startsWith('-');
    s = (neg ? '-' : '') + s.replace(/-/g, '');
  } else {
    s = s.replace(/-/g, '');
  }

  if (decimals <= 0) return s.replace(/\./g, '');

  // Keep the first decimal point, drop the rest: "1.2.3" becomes "1.23", which
  // is what someone fumbling the key meant, rather than an empty field.
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
    const [int, frac = ''] = s.split('.');
    s = frac.length > decimals ? `${int}.${frac.slice(0, decimals)}` : s;
  }
  return s;
}

export function NumberInput({
  value, onChange, allowNegative = false, decimals = 2, className = '', id, ...rest
}: NumberInputProps) {
  const autoId = useId();
  return (
    <input
      id={id ?? autoId}
      type="text"
      inputMode={decimals > 0 ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(sanitizeNumeric(e.target.value, allowNegative, decimals))}
      onPaste={(e) => {
        // Pasting "₹1,234.00" from a statement should work, not be rejected.
        e.preventDefault();
        const text = e.clipboardData.getData('text');
        onChange(sanitizeNumeric(text.replace(/[₹$€£,\s]/g, ''), allowNegative, decimals));
      }}
      className={
        className ||
        'w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-50'
      }
      {...rest}
    />
  );
}
