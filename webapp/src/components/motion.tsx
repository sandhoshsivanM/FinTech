'use client';
/**
 * The motion system.
 *
 * Every animated surface in the app pulls its variants from here so timing and
 * easing stay consistent — 250ms on the standard curve, matching `--dur` and
 * `--ease` in globals.css. Pages should not hand-roll variants.
 *
 * Reduced motion is handled once, at the root: `<MotionConfig reducedMotion="user">`
 * in AppFrame makes Framer Motion drop transforms and opacity fades for users
 * who ask for it. The chart draw-in machinery in `charts/useEntrance.ts` has
 * its own equivalent guard and is deliberately left alone — Framer wraps
 * around it rather than replacing it.
 */
import {
  motion,
  useInView,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants,
} from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';

/** Matches `--dur` / `--ease`. */
export const EASE = [0.4, 0, 0.2, 1] as const;
export const DUR = 0.25;
export const DUR_SLOW = 0.4;

/** Rise and fade. The default entrance for a card or section. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: DUR_SLOW, ease: EASE } },
};

/** Fade with no movement — for things that should not appear to travel. */
export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DUR, ease: EASE } },
};

/** Scale in from slightly small. For popovers, menus and modals. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  show: { opacity: 1, scale: 1, transition: { duration: DUR, ease: EASE } },
};

/**
 * Parent variant that walks its children in. 45ms apart is deliberate: fast
 * enough that a seven-tile KPI row still lands inside a third of a second, slow
 * enough that the sequence reads as intentional rather than as jank.
 */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};

/** Page-level wrapper: stagger children on mount. */
export function Stagger({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & HTMLMotionProps<'div'>) {
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      // `[&.grid]:grid-cols-[minmax(0,1fr)]` is load-bearing: without it the
      // implicit grid track sizes to the widest child's min-content and the
      // whole page scrolls sideways.
      className={clsx('min-w-0 [&.grid]:grid-cols-[minmax(0,1fr)]', className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** A direct child of `Stagger`. Rises into place when its turn comes. */
export function StaggerItem({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & HTMLMotionProps<'div'>) {
  return (
    <motion.div variants={fadeUp} className={clsx('min-w-0', className)} {...rest}>
      {children}
    </motion.div>
  );
}

/**
 * Reveals when scrolled into view, once. For content far below the fold, where
 * a mount-time stagger would have finished long before anyone saw it.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: DUR_SLOW, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Counts a number up on mount.
 *
 * `format` receives the interpolated value, so the caller keeps control of
 * currency, precision and the ghost-mode mask. Under reduced motion the final
 * value renders immediately — the point of the component is the figure, not
 * the animation.
 */
export function AnimatedNumber({
  value,
  format = (n) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 }),
  durationMs = 900,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduced) return;
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      // easeOutCubic — fast to begin, settles gently on the real figure.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    // Scheduled, not called inline: a synchronous setState here would cascade
    // a render on every mount.
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs, reduced]);

  // A screen reader gets the settled figure, not the ticking one.
  return (
    <span className={className}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

export { motion, useReducedMotion };
