'use client';
/**
 * Khazana Online's side of the shared screens' platform adapters
 * (`@khazana/screens/platform`): a browser download for saved files, the build
 * version, the feedback link, sample data, and Online's own wording for Help,
 * Privacy and Terms. Idempotent, so every entry point can call it.
 */
import { Mail } from 'lucide-react';
import { configurePlatform } from '@khazana/screens/platform';
import { CONTACT } from '@khazana/screens/copy/legal';
import { loadSampleData } from './sampleData';
import { onlineCopy } from './onlineCopy';

export const APP_VERSION = '0.1.0';

function SendFeedbackLink() {
  return (
    <a
      href={`mailto:${CONTACT}?subject=${encodeURIComponent(`Khazana Online feedback (${APP_VERSION})`)}`}
      className="focus-ring inline-flex items-center gap-2 text-[13px] font-medium text-ink hover:underline"
    >
      <Mail size={15} /> Send feedback
    </a>
  );
}

let installed = false;
export function installScreensPlatform(): void {
  if (installed) return;
  installed = true;
  configurePlatform({
    appVersion: APP_VERSION,
    // Same-origin static files only (public/): the logo and fonts a report embeds.
    fetchAsset: async (path) => {
      const res = await fetch(path);
      return res.ok ? res.arrayBuffer() : null;
    },
    SendFeedbackLink,
    loadSampleData,
    copy: onlineCopy,
  });
}
