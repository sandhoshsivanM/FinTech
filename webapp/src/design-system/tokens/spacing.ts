/** 8px base scale. Nothing in the product should use an off-scale value. */
export const space = {
  1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px',
  6: '24px', 8: '32px', 10: '40px', 12: '48px', 16: '64px',
  20: '80px', 24: '96px',
} as const;

/** Layout constants the shell and pages agree on. */
export const layout = {
  cardPadding: '20px',
  cardPaddingLarge: '24px',
  cardGap: '16px',
  sectionGap: '32px',
  pagePaddingDesktop: '40px',
  pagePaddingMobile: '16px',
  navWidth: '248px',
  navRail: '76px',
  topbarHeight: '64px',
  contentMax: '1560px',
} as const;
