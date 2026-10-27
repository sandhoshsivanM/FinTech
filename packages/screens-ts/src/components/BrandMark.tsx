import Image from 'next/image';

/**
 * The Khazana mark.
 *
 * This renders the SUPPLIED brand artwork — the rendered gold hexagon with its
 * keyhole and K — not a redrawn approximation of it. The master is the vector
 * `assets/brand/khazana-mark.svg`, rendered to `assets/brand/khazana-mark.png`
 * (1024px, transparent), and every platform icon is generated from that one
 * file by `scripts/gen-icons.mjs`. The app, the Mac build, the favicon and the
 * installer therefore cannot drift from each other or from the master — which
 * is exactly what had happened: macOS
 * carried a different render, the PWA manifest pointed at a flat vector that
 * was a different drawing again, and Flutter web still shipped the stock
 * Flutter logo.
 *
 * Because it is raster, it is used at 24px and above. Below that the 3D bevel
 * and the keyhole stop resolving, so the favicon set is pre-composited on the
 * Vault plate at each exact size rather than scaled in the browser.
 *
 * Dark theme: the deep-green master (#0F4535→#05271F) all but vanishes on the
 * #0E0E10 graphite page, so a lifted variant (`khazana-mark-dark.png`, rendered
 * from `assets/brand/khazana-mark-dark.svg`; gold untouched) is shown there.
 * Both <img>s are always rendered and CSS picks one (`.brandmark-light` /
 * `.brandmark-dark` in globals.css, keyed on [data-theme] with a
 * prefers-color-scheme fallback when no theme is set). Choosing in JS would
 * render the light mark on the server and swap after hydration — a mismatch
 * and a visible flash. Unless `priority` is set, the hidden one is lazy and never fetched.
 */
export function BrandMark({
  size = 34,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  /** Set on the vault gate, where the mark is the largest thing on screen. */
  priority?: boolean;
}) {
  const common = {
    alt: 'Khazana',
    width: size,
    height: size,
    // `priority` is deprecated in Next 16; eager + high fetch priority is the
    // documented replacement for an above-the-fold image.
    ...(priority ? { loading: 'eager' as const, fetchPriority: 'high' as const } : {}),
    style: { width: size, height: size, objectFit: 'contain' as const },
  };
  const cls = (variant: string) => (className ? `${variant} ${className}` : variant);
  return (
    <>
      <Image src="/khazana-mark.png" className={cls('brandmark-light')} {...common} />
      <Image src="/khazana-mark-dark.png" className={cls('brandmark-dark')} {...common} alt="" aria-hidden />
    </>
  );
}

/**
 * The wordmark: KHAZANA, wide-tracked geometric caps.
 *
 * Set in the app's own sans (Anek Latin) rather than shipping a separate
 * display face for six letters — the tracking is what carries the identity
 * here, and it keeps the lockup on a font the app already loads.
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
