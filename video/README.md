# Khazana promo video

A 30-second motion-graphics ad for Khazana, written as code with [Remotion](https://www.remotion.dev) (React components rendered to video). It produces two 4K, 30fps versions:

| Composition | Size | Use |
|---|---|---|
| `Ad16x9` | 3840×2160 | YouTube, website, LinkedIn |
| `Ad9x16` | 2160×3840 | Reels, Shorts, Stories, Play Store promo |

Both share the same scenes. Each scene checks the aspect ratio and lays itself out to fit: text beside the visual in landscape, text above it in portrait.

## Commands

```bash
npm install
npm run studio        # live preview in the browser; scrub, edit, see changes instantly
npm run render:all    # both MP4s into out/ (h264, CRF 16)
npm run render:master # ProRes 4444 .mov of the 16:9 cut, for a video editor
npm run capture       # re-shoot the phone screens from webapp/out (rebuild the webapp first)
npm run typecheck
```

Remotion bundles its own ffmpeg, so no system ffmpeg is needed.

## Changing things

- **Copy:** every on-screen line is in `src/scenes.tsx`, one component per scene.
- **Timing:** scene lengths are in the `SCENES` array in `src/Ad.tsx`. Neighbouring scenes overlap by a 15-frame transition, so the total is the sum of the scene lengths minus 7×15.
- **Colours and font:** `src/theme.ts` copies the Zentra dark tokens from `webapp/src/app/globals.css`. The font is Anek Latin, from `assets/fonts`.
- **App screens:** the PNGs in `public/screens/` are real captures of the app with its built-in sample data, at 1170×2532. The figures in the ad (₹44,36,934 balance, score 76, 7.8 months) match that sample data. If you re-capture and the sample data changes, update the figures too.
- **Music:** put a licensed track at `public/music.mp3`. It is mixed in automatically with a fade in and out. If there's no file, the ad renders silent. Use music you hold a licence for, such as the YouTube Audio Library, Pixabay Music, or an Artlist or Epidemic Sound subscription.

## Licences

- **Remotion** is free for individuals and for companies with up to 3 employees. A larger company needs a [Remotion company licence](https://www.remotion.pro) to render this commercially.
- **Anek Latin** is under the SIL Open Font License (`public/fonts/AnekLatin-OFL.txt`).
- **Icons** are lucide path data (ISC).
- **Broker and bank names** in the import scene are shown as plain text only, to state compatibility. No third-party logos are used.
