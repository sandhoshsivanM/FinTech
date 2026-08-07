/** Motion. One curve, three durations — anything else is decoration. */
export const duration = { fast: 150, base: 250, slow: 400 } as const;
export const easing = 'cubic-bezier(0.4, 0, 0.2, 1)';
/** Framer Motion wants the cubic-bezier as an array. */
export const easingArray = [0.4, 0, 0.2, 1] as const;
