// The palette's guarantee, as a check rather than a claim.
//
// Six comment blocks across the repo used to quote ΔE figures for the chart
// colours, and they disagreed with each other — asset_group_colors.dart carried
// two stacked headers claiming 9.1 (protanopia) and 12.7 (deuteranopia) for the
// same seven colours. Nothing could fail if a value drifted, so none of those
// numbers were load-bearing. These tests are.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deltaE, contrast, worstAdjacent, worstAnyPair, hexToLinear, inGamut, DATAVIZ,
  type Vision,
} from './colorScience';
import {
  SERIES_DARK, SERIES_LIGHT, SERIES_ORDER, SERIES_BY_KEY, SURFACE, SERIES_NEUTRAL,
} from './palette';

const CVD: Vision[] = ['protanopia', 'deuteranopia', 'tritanopia'];
const THEMES = [
  ['Vault (dark)', SERIES_DARK, SURFACE.dark],
  ['Ledger (light)', SERIES_LIGHT, SURFACE.light],
] as const;

describe('the maths itself', () => {
  test('a colour is zero distance from itself', () => {
    expect(deltaE('#189E6E', '#189E6E')).toBeCloseTo(0, 6);
  });

  test('black and white are the extreme contrast pair', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  test('contrast is symmetric', () => {
    expect(contrast('#41B283', '#151E1A')).toBeCloseTo(contrast('#151E1A', '#41B283'), 6);
  });

  test('red and green collapse under deuteranopia but not under normal vision', () => {
    // The sanity check on the CVD matrices. If this ever inverts, the simulation
    // is wired wrong and every other assertion here is meaningless.
    const normal = deltaE('#CC0000', '#00AA00', 'normal');
    const deutan = deltaE('#CC0000', '#00AA00', 'deuteranopia');
    expect(deutan).toBeLessThan(normal);
  });

  test('a malformed colour throws rather than silently scoring zero', () => {
    expect(() => hexToLinear('rebeccapurple')).toThrow();
    expect(() => hexToLinear('#FFF')).toThrow();
  });
});

describe.each(THEMES)('%s', (_name, series, surface) => {
  test('every colour is inside sRGB', () => {
    for (const hex of series) expect(inGamut(hexToLinear(hex))).toBe(true);
  });

  test('every series mark clears 3:1 against the card it sits on', () => {
    // WCAG 1.4.11: a chart mark is a graphic object, so 3:1 is the bar.
    for (const [i, hex] of series.entries()) {
      const c = contrast(hex, surface);
      expect(c, `${SERIES_ORDER[i]} (${hex}) on ${surface}`)
        .toBeGreaterThanOrEqual(DATAVIZ.minContrastVsSurface);
    }
  });

  test('adjacent marks stay separable under normal vision', () => {
    const { deltaE: d, between } = worstAdjacent(series, 'normal');
    expect(d, `worst pair: ${SERIES_ORDER[between[0]]}/${SERIES_ORDER[between[1]]}`)
      .toBeGreaterThanOrEqual(DATAVIZ.minAdjacentNormalDeltaE);
  });

  // ANY pair, not just neighbours — this is the bar that actually matters, and
  // the one the previous palette failed at ΔE 3.0 under deuteranopia.
  //
  // Adjacency in SERIES_ORDER is not what a reader sees. A portfolio holding
  // only equity and real-estate renders those two side by side even though four
  // slots separate them in the list. Every subset of the taxonomy is a layout
  // that can occur, so every pair has to hold up.
  test.each(CVD)('ANY two marks stay separable under %s', (vision) => {
    const { deltaE: d, between } = worstAnyPair(series, vision);
    expect(d, `worst pair: ${SERIES_ORDER[between[0]]}/${SERIES_ORDER[between[1]]}`)
      .toBeGreaterThanOrEqual(DATAVIZ.minAdjacentCvdDeltaE);
  });

  test('no two series are the same colour', () => {
    expect(new Set(series).size).toBe(series.length);
  });

  test('the neutral does not pass as a category', () => {
    // "Unclassified" must read as absence. If it were as vivid as a real slice
    // it would compete with one.
    const neutral = surface === SURFACE.dark ? SERIES_NEUTRAL.dark : SERIES_NEUTRAL.light;
    for (const hex of series) {
      expect(deltaE(hex, neutral, 'normal')).toBeGreaterThan(8);
    }
  });
});

describe('render order is the mechanism, not a preference', () => {
  test.each(CVD)('a value-sorted chart is safe because ANY pair holds under %s', (vision) => {
    // The old palette guaranteed neighbours only, so colouring slices by rank
    // could place two indistinguishable colours together. Guaranteeing every
    // pair is what makes sort order a free choice rather than a hazard.
    expect(worstAnyPair(SERIES_DARK, vision).deltaE)
      .toBeGreaterThanOrEqual(DATAVIZ.minAdjacentCvdDeltaE);
    expect(worstAnyPair(SERIES_LIGHT, vision).deltaE)
      .toBeGreaterThanOrEqual(DATAVIZ.minAdjacentCvdDeltaE);
  });

  test('the seven asset groups come first, in ASSET_GROUP_ORDER', () => {
    // The chart palette and the asset taxonomy have to agree on order, or the
    // adjacency the ΔE guarantee covers is not the adjacency on screen.
    expect(SERIES_ORDER.slice(0, 7)).toEqual([
      'equity', 'debt', 'gold', 'real_estate', 'retirement', 'crypto', 'cash',
    ]);
  });

  test('the brand anchors are pinned', () => {
    // Equity is the product's own emerald; gold is gold. An earlier palette
    // rendered the Gold group green, which reads as a bug from the legend alone.
    const equity = SERIES_BY_KEY.equity;
    const gold = SERIES_BY_KEY.gold;
    // Emerald: green-dominant in both themes.
    for (const hex of [equity.dark, equity.light]) {
      const [r, g, b] = hexToLinear(hex);
      expect(g, `equity ${hex} should be green-dominant`).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    }
    // Gold: warm — red and green well above blue.
    for (const hex of [gold.dark, gold.light]) {
      const [r, g, b] = hexToLinear(hex);
      expect(r, `gold ${hex} should be warm`).toBeGreaterThan(b);
      expect(g).toBeGreaterThan(b);
    }
  });
});

describe('the two themes are steps of one palette, not two palettes', () => {
  test('each series keeps its identity across themes', () => {
    // Same hue, different lightness. If a series changed hue between themes the
    // legend would be teaching two different things depending on the setting.
    for (const key of SERIES_ORDER) {
      const { dark, light } = SERIES_BY_KEY[key];
      expect(deltaE(dark, light, 'normal'), `${key} drifts too far between themes`)
        .toBeLessThan(60);
    }
  });

  test('the dark step is lighter than the light step', () => {
    // The whole point of per-theme values: lift on dark ground, drop on light.
    const lum = (hex: string) => {
      const [r, g, b] = hexToLinear(hex);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const key of SERIES_ORDER) {
      const { dark, light } = SERIES_BY_KEY[key];
      expect(lum(dark), `${key}: dark step should be the lighter one`)
        .toBeGreaterThan(lum(light));
    }
  });
});

describe('globals.css carries the same palette', () => {
  // The CSS cannot import TypeScript, so --c1..--c8 are hand-written. That is
  // exactly the situation that let four copies of the old palette drift apart,
  // so this test is the guard: it reads the stylesheet and compares.
  // Resolved from the vitest root rather than import.meta.url: under the jsdom
  // environment import.meta.url is not a file: URL.
  const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

  /** Pulls --c1..--c8 out of the Nth `:root`-ish block that declares them. */
  const seriesBlocks = (): string[][] => {
    const out: string[][] = [];
    for (const m of css.matchAll(/--c1:\s*(#[0-9A-Fa-f]{6})[\s\S]{0,400}?--c8:\s*(#[0-9A-Fa-f]{6})/g)) {
      const chunk = m[0];
      const vals = [...chunk.matchAll(/--c[1-8]:\s*(#[0-9A-Fa-f]{6})/g)].map((x) => x[1].toUpperCase());
      if (vals.length === 8) out.push(vals);
    }
    return out;
  };

  test('both themes declare a full eight-colour series', () => {
    expect(seriesBlocks()).toHaveLength(2);
  });

  test('the declared values are exactly the generated ones', () => {
    const blocks = seriesBlocks();
    // Source order in the file is light `:root` first, then the dark override.
    expect(blocks[0]).toEqual(SERIES_LIGHT.map((h) => h.toUpperCase()));
    expect(blocks[1]).toEqual(SERIES_DARK.map((h) => h.toUpperCase()));
  });

  test('no stale single-theme palette is left behind', () => {
    // The old set lived in the theme-invariant block. If any of those hexes
    // survive as a --c value, something was half-migrated.
    const stale = ['#189E6E', '#BE8420', '#2E92C4', '#C9538A', '#4F7CFF', '#CC6435', '#8E7CC3', '#2E9E63'];
    for (const block of seriesBlocks()) {
      for (const v of block) expect(stale).not.toContain(v);
    }
  });
});
