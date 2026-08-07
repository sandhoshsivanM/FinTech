import Image from 'next/image';

/**
 * The Khazana mark.
 *
 * This renders the SUPPLIED brand artwork — the rendered gold hexagon with its
 * keyhole and K — not a redrawn approximation of it. The master lives at
 * `public/khazana-mark.png` (1024px, transparent) and every platform icon is a
 * resize of that same file, so the app, the Mac build, the favicon and the
 * installer can never drift from each other or from the brand sheet.
 *
 * Because it is raster, it is used at 24px and above. Below that the 3D bevel
 * and the keyhole stop resolving, so the favicon set is pre-composited on the
 * Vault plate at each exact size rather than scaled in the browser.
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
  return (
    <Image
      src="/khazana-mark.png"
      alt="Khazana"
      width={size}
      height={size}
      priority={priority}
      className={className}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
}

/**
 * The wordmark: KHAZANA, wide-tracked geometric caps.
 *
 * Set in Inter rather than shipping the brand sheet's display face for six
 * letters — the tracking is what carries the identity here, and it keeps the
 * lockup on a font the app already loads.
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
