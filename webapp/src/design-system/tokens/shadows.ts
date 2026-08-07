/**
 * Elevation.
 *
 * Dark (Vault) uses borders, not shadows — a shadow on a near-black canvas is
 * invisible, and faking depth with a glow is what makes AI-generated finance UI
 * look like a crypto exchange. Light (Ledger) uses one very subtle lift.
 *
 * Khazana should read as precise, not floating.
 */
export const shadow = {
  vault: { card: 'none', raised: 'none', overlay: '0 24px 48px -24px rgba(0,0,0,0.75)' },
  ledger: {
    card: '0 1px 2px rgba(16,22,19,0.05)',
    raised: '0 2px 8px rgba(16,22,19,0.08)',
    overlay: '0 18px 44px -18px rgba(16,22,19,0.22)',
  },
} as const;
