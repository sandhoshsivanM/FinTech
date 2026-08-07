/**
 * Corner radii.
 *
 * Per-component values are prescribed rather than left to the scale, because
 * "everything is a giant rounded rectangle" is exactly the generic look this
 * system is avoiding. A button is tighter than a card; a card is tighter than
 * a modal.
 */
export const radius = {
  xs: '6px', sm: '8px', md: '12px', lg: '16px', xl: '20px', pill: '999px',
} as const;

export const componentRadius = {
  input: '10px',
  button: '9px',
  card: '14px',
  panel: '16px',
  modal: '18px',
  badge: '999px',
} as const;
