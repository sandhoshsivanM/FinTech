/**
 * The Khazana mark.
 *
 * Three ideas in one glyph, per the brand sheet:
 *   - a hexagon — the vault plate
 *   - a keyhole — privacy, the PIN that never leaves the device
 *   - a chevron that closes against the plate's left edge to read as **K**
 *
 * Drawn as flat geometry rather than the sheet's rendered metal gradient. A
 * gradient bevel disappears at 16px in a browser tab and turns to mud on a
 * maskable Android icon; the flat cut keeps the silhouette readable from
 * favicon to 1024px app icon, which is the same reason the sheet itself shows
 * single-colour variants alongside the hero treatment.
 *
 * Variants map to the four lockups on the sheet:
 *   duo   — gold line on a deep-emerald plate (the primary)
 *   mono  — one colour, plate transparent (cream and emerald backgrounds)
 *   plate — filled plate, glyph knocked out in the surface colour
 */
export type MarkVariant = 'duo' | 'mono' | 'plate';

export function BrandMark({
  size = 34,
  variant = 'duo',
  color,
  plate,
  className,
}: {
  size?: number;
  variant?: MarkVariant;
  /** The line colour. Defaults to the gold accent. */
  color?: string;
  /** The plate fill. Defaults to the brand emerald. */
  plate?: string;
  className?: string;
}) {
  const line = color ?? (variant === 'plate' ? 'var(--brand-plate)' : 'var(--accent)');
  const bg = variant === 'mono' ? 'none'
    : variant === 'plate' ? (color ?? 'var(--accent)')
      : (plate ?? 'var(--brand-plate)');
  const glyph = variant === 'plate' ? (plate ?? 'var(--brand-plate)') : line;

  // Pointy-top hexagon, circumradius 13.4 about (16,16). Vertical left and
  // right edges; the left one doubles as the K's stem.
  const hex = 'M16 2.6 L27.6 9.3 L27.6 22.7 L16 29.4 L4.4 22.7 L4.4 9.3 Z';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="Khazana"
    >
      {/* Plate */}
      <path d={hex} fill={bg} />
      {/* Plate outline — omitted on `plate`, where the fill is the shape */}
      {variant !== 'plate' && (
        <path d={hex} stroke={line} strokeWidth="2.4" strokeLinejoin="round" />
      )}

      {/* Keyhole: circle over a tapered tail. Sits left of centre so the
          chevron has room without crowding it. */}
      <circle cx="11.6" cy="13.3" r="2.35" fill={glyph} />
      <path d="M9.75 20.1 L11.6 14.7 L13.45 20.1 Z" fill={glyph} />

      {/* The K. Converges on the plate's left edge and opens right, so the
          stem is the hexagon itself rather than a fourth stroke. */}
      <path
        d="M25.9 7.6 L13.4 16 L25.9 24.4"
        stroke={glyph}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The wordmark: KHAZANA, wide-tracked geometric caps.
 *
 * The sheet sets it in a display face with a flat-apex A. Inter at 700 with
 * heavy tracking is the closest match available offline, and it keeps the
 * lockup to one already-loaded font rather than shipping a second file for six
 * letters.
 */
export function WordMark({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{ letterSpacing: '0.22em', fontWeight: 700, textTransform: 'uppercase' }}
    >
      Khazana
    </span>
  );
}
