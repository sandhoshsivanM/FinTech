/**
 * The offline app's side of the shared screens' platform adapters
 * (`@khazana/screens/platform`): Tauri-aware file saving, the build version, the
 * tour, the feedback link and sample data. Idempotent, so every entry point
 * (the app layout, the test setup) can call it.
 */
import { configurePlatform } from '@khazana/screens/platform';
import { APP_VERSION } from './store';
import { saveFile } from './saveFile';
import { loadSampleData } from './sampleData';
import { TOUR_EVENT } from '@khazana/screens/components/Tour';
import { SendFeedbackLink } from '@/components/Feedback';

export function installScreensPlatform(): void {
  configurePlatform({
    appVersion: APP_VERSION,
    saveFile,
    // Same-origin static files only (public/): the logo and fonts a report embeds.
    fetchAsset: async (path) => {
      const res = await fetch(path);
      return res.ok ? res.arrayBuffer() : null;
    },
    replayTour: () => window.dispatchEvent(new Event(TOUR_EVENT)),
    SendFeedbackLink,
    loadSampleData,
  });
}
