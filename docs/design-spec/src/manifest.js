/**
 * Page order.
 *
 * The single place that decides what the document contains and in which order.
 * Each import is an array of sheet HTML strings; `build.mjs` flattens them and
 * numbers the folios.
 */
import front from './pages/front.js';
import foundations from './pages/foundations.js';
import components from './pages/components.js';
import screens from './pages/screens.js';
import mobile from './pages/mobile.js';
import ux from './pages/ux.js';
import appendix from './pages/appendix.js';

export const PAGES = [
  front,
  foundations,
  components,
  screens,
  mobile,
  ux,
  appendix,
];
