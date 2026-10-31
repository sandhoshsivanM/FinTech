import {
  Atkinson_Hyperlegible_Next, DM_Sans, IBM_Plex_Sans, Inter, Manrope, Noto_Sans,
  Plus_Jakarta_Sans, Poppins, Roboto,
} from 'next/font/google';

// The faces a reader can pick in Settings → Appearance (FONT_FAMILIES in
// @khazana/domain/appearance names the same --font-* variables). next/font
// downloads them at BUILD time and serves them from this site, so choosing one
// never makes the offline app call a font server. Options must be literals
// (next/font reads them at build time), hence the repetition.
//
// `preload: false`: the browser fetches a face only once some text uses it, so
// the default Anek Latin user downloads none of these. `latin-ext` carries ₹.
const atkinson = Atkinson_Hyperlegible_Next({ subsets: ['latin', 'latin-ext'], variable: '--font-atkinson', display: 'swap', preload: false });
const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-inter', display: 'swap', preload: false });
const noto = Noto_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-noto', display: 'swap', preload: false });
const manrope = Manrope({ subsets: ['latin', 'latin-ext'], variable: '--font-manrope', display: 'swap', preload: false });
const dmsans = DM_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-dmsans', display: 'swap', preload: false });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-jakarta', display: 'swap', preload: false });
const plex = IBM_Plex_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-plex', display: 'swap', preload: false });
const roboto = Roboto({ subsets: ['latin', 'latin-ext'], variable: '--font-roboto', display: 'swap', preload: false });
// Not a variable font, so the weights the app uses are listed.
const poppins = Poppins({
  subsets: ['latin', 'latin-ext'], variable: '--font-poppins', display: 'swap', preload: false,
  weight: ['300', '400', '500', '600', '700'],
});

/** Class names that define every --font-* variable; put them on <html>. */
export const readingFontVariables = [atkinson, inter, noto, manrope, dmsans, jakarta, plex, roboto, poppins]
  .map((f) => f.variable)
  .join(' ');
