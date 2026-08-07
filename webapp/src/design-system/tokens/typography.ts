/**
 * Type scale. Inter throughout the product.
 *
 * A display serif is reserved for MARKETING only — it is deliberately absent
 * here so it cannot leak into the app and blur the line between the two.
 *
 * Financial figures use tabular numerals so columns align; `.tnum` in
 * globals.css applies it, and it is on globally via `font-variant-numeric`.
 */
export const fontSize = {
  display: { size: '48px', line: '56px' },
  h1: { size: '32px', line: '40px' },
  h2: { size: '24px', line: '32px' },
  h3: { size: '20px', line: '28px' },
  h4: { size: '16px', line: '24px' },
  bodyLarge: { size: '16px', line: '24px' },
  body: { size: '14px', line: '22px' },
  small: { size: '13px', line: '20px' },
  caption: { size: '12px', line: '18px' },
} as const;

/** Figure sizes. Separate from prose: a number is a mark, not a sentence. */
export const numberSize = { xl: '32px', large: '24px', medium: '18px' } as const;

/** 700 is for display only — overusing it flattens the hierarchy. */
export const fontWeight = {
  regular: 400,
  text: 450,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;
