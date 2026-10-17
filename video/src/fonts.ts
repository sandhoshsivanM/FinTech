import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';

// Anek Latin, the app's font (chosen for its proper ₹ glyph). Every frame waits
// for all five weights, so no frame renders in a fallback font.
const WEIGHTS: Record<string, string> = {
  '300': 'Light',
  '400': 'Regular',
  '500': 'Medium',
  '600': 'SemiBold',
  '700': 'Bold',
};

const handle = delayRender('Loading Anek Latin');
Promise.all(
  Object.entries(WEIGHTS).map(async ([weight, name]) => {
    const face = new FontFace('Anek Latin', `url(${staticFile(`fonts/AnekLatin-${name}.ttf`)}) format('truetype')`, { weight });
    document.fonts.add(await face.load());
  }),
)
  .then(() => continueRender(handle))
  .catch((err) => cancelRender(err));
