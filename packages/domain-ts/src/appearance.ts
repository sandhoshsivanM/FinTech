// Theme and accent choices, as data. Ported from webapp/src/lib/store.ts (the
// offline app keeps its copy until it moves onto this one). Keys are FROZEN:
// they are persisted in localStorage.
//
export type ThemeChoice = 'light' | 'dark' | 'system';
export type AccentName = 'default' | 'emerald' | 'blue' | 'violet' | 'amber' | 'rose' | 'lime';

// Each accent is tuned separately for light and dark so it always reads well.
// [accent, accent-deep, accent-glow]. 'default' is Zentra Ink and sets no
// inline properties at all — it falls through to the CSS defaults in
// globals.css: the near-black pill (#111214 light / #F5F5F7 dark).
//
// The five alternates are named and toned as gemstones/metals rather than as
// web colours, because the product's identity is a treasury. Each light step is
// darkened until it clears 4.5:1 on white — the mid-tone that looks right on a
// dark surface is unreadable on a light one.
//
// The five named accents are drawn from the same palette family as the
// semantics, so a recoloured product still looks like one system. Keys are
// FROZEN: they are persisted in localStorage, so renaming one silently resets
// that user's choice. 'blue' is Indigo rather than a second Khazana Blue for
// exactly that reason — the key had to stay even though the colour moved.
//
// Any change here must be mirrored in the no-FOUC script in app/layout.tsx,
// which carries a copy of this table so the accent lands before first paint.
export const ACCENTS: Record<Exclude<AccentName, 'default'>, {
  label: string; swatch: string; light: [string, string, string]; dark: [string, string, string];
  /** Text colour on a solid accent fill, per theme, when white would fail. */
  on?: { light: string; dark: string };
}> = {
  // Jade sits deliberately close to the brand plate; it is the one alternate
  // that brings back the emerald identity in place of the ink pill.
  emerald: { label: 'Jade', swatch: '#1B7F52', light: ['#136344', '#0D4C33', '#1B7F52'], dark: ['#3FD99A', '#1F8A5B', '#7BE9BC'] },
  blue: { label: 'Sapphire', swatch: '#3B5FBF', light: ['#2F4C9C', '#243B7A', '#4F7CFF'], dark: ['#6E93FF', '#4A6FE0', '#A9C1FF'] },
  violet: { label: 'Amethyst', swatch: '#6E5BB8', light: ['#584796', '#443873', '#8E7CC3'], dark: ['#A492DC', '#7E6CB8', '#C9BDEE'] },
  amber: { label: 'Copper', swatch: '#B4642A', light: ['#8E4E20', '#703D19', '#C2610F'], dark: ['#D98A4E', '#B4642A', '#F0B183'] },
  rose: { label: 'Garnet', swatch: '#A83A45', light: ['#8C2F38', '#6E252C', '#C0392F'], dark: ['#E0707C', '#B84B58', '#F2A6AE'] },
  // Neon lime on Vault; on Ledger a lime that light would be unreadable as
  // text, so it deepens to olive (6:1 on white). Dark ink on the neon fill —
  // white on #C5F23A is 1.3:1.
  lime: {
    label: 'Lime', swatch: '#A8D61F',
    light: ['#4D6B00', '#3A5200', '#8DB31F'], dark: ['#C5F23A', '#8DB31F', '#DDFF7A'],
    on: { light: '#FFFFFF', dark: '#0B0F0D' },
  },
};

/** The CSS custom properties an accent sets for light or dark; empty for 'default' / unknown. */
export function accentVars(name: string, dark: boolean): Record<string, string> {
  const a = (ACCENTS as Record<string, (typeof ACCENTS)[keyof typeof ACCENTS]>)[name];
  if (!a) return {};
  const [c, d, g] = dark ? a.dark : a.light;
  const vars: Record<string, string> = { '--accent': c, '--accent-deep': d, '--accent-glow': g };
  if (a.on) vars['--accent-on'] = dark ? a.on.dark : a.on.light;
  return vars;
}

// Reading comfort: Settings → Appearance in the offline app. Testers could not
// read the 11–13px figures, so the reader picks a text size and a typeface.
// Keys are FROZEN (persisted in localStorage) and, like ACCENTS, mirrored in
// the no-FOUC script in webapp/src/app/layout.tsx.

export type TextSize = 'small' | 'default' | 'large' | 'larger' | 'largest';

/** Multiplier applied to every text size through the --font-scale variable. */
export const TEXT_SIZES: Record<TextSize, { label: string; scale: number }> = {
  small: { label: 'Small', scale: 0.9 },
  default: { label: 'Default', scale: 1 },
  large: { label: 'Large', scale: 1.15 },
  larger: { label: 'Larger', scale: 1.3 },
  largest: { label: 'Largest', scale: 1.5 },
};

export type FontFamily =
  | 'default' | 'atkinson' | 'inter' | 'noto' | 'manrope' | 'dmsans'
  | 'jakarta' | 'plex' | 'roboto' | 'poppins' | 'system';

/**
 * What --font-sans becomes for each choice. 'default' (Anek Latin) sets
 * nothing and falls through to the app's own font. Every web font here was
 * checked to draw ₹ (U+20B9) itself in its latin-ext subset — the original
 * Atkinson Hyperlegible does not, which is why this is the Next cut. Check any
 * new face the same way before adding it.
 */
export const FONT_FAMILIES: Record<FontFamily, { label: string; note: string; value: string | null }> = {
  default: { label: 'Anek Latin', note: 'Khazana default', value: null },
  atkinson: { label: 'Atkinson Hyperlegible', note: 'Made for low vision', value: 'var(--font-atkinson)' },
  inter: { label: 'Inter', note: 'Clear, even digits', value: 'var(--font-inter)' },
  noto: { label: 'Noto Sans', note: 'Familiar Android look', value: 'var(--font-noto)' },
  manrope: { label: 'Manrope', note: 'Modern fintech', value: 'var(--font-manrope)' },
  dmsans: { label: 'DM Sans', note: 'Modern fintech', value: 'var(--font-dmsans)' },
  jakarta: { label: 'Plus Jakarta Sans', note: 'Modern fintech', value: 'var(--font-jakarta)' },
  plex: { label: 'IBM Plex Sans', note: 'Banking classic', value: 'var(--font-plex)' },
  roboto: { label: 'Roboto', note: 'Payments-app look', value: 'var(--font-roboto)' },
  poppins: { label: 'Poppins', note: 'Rounded and wide', value: 'var(--font-poppins)' },
  system: {
    label: 'System font', note: 'Your device’s own font',
    // Unquoted on purpose (valid CSS) so the no-FOUC script can carry it verbatim.
    value: '-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, sans-serif',
  },
};

/** The two CSS custom properties a reading choice sets on <html>; unknown keys fall back to the defaults. */
export function readingVars(size: string, font: string): { '--font-scale': string; '--font-sans': string | null } {
  const s = (TEXT_SIZES as Record<string, { scale: number }>)[size] ?? TEXT_SIZES.default;
  const f = (FONT_FAMILIES as Record<string, { value: string | null }>)[font] ?? FONT_FAMILIES.default;
  return { '--font-scale': String(s.scale), '--font-sans': f.value };
}
