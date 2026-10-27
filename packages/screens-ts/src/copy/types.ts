import type { ReactNode } from 'react';

/**
 * The words that differ between the apps: where the data lives, what leaves the
 * device, what the legal pages promise. The offline vault and Khazana Online
 * each hand theirs to `configurePlatform({ copy })`; the screens render
 * whichever they were given, so neither app claims the other's guarantees.
 */
export interface ProductCopy {
  help: {
    faq: [question: string, answer: string][];
    /** The `<li>` rows of the Help screen's Privacy card. */
    privacyBullets: ReactNode;
    /** The soft button under them, or none. */
    privacyAction: { label: string; href: string } | null;
    /** The "Still stuck?" paragraph. */
    stuck: string;
  };
  privacy: {
    /** Subtitle fragment after the title, e.g. "How Khazana handles your data". */
    subtitle: string;
    /** Body of "The short version". */
    short: ReactNode;
    /** The sections between "The short version" and "Children": storage, network, sync, permissions, backups. */
    dataSections: ReactNode;
    /** Body of "Your rights". */
    rights: string;
    /** The muted note under the contact line. */
    contactNote: string;
    /** The footer pointer to Settings, e.g. "for backup and erase". */
    settingsPointer: string;
  };
  terms: {
    /** Body of "Your data is yours". */
    yourData: ReactNode;
    /** Body of "No warranty, and keep your backups". */
    warranty: ReactNode;
    /** Open-source components named in the governing-law section. */
    components: string;
    /** The demo-data sentence in "Not financial advice". */
    demoNote: string;
  };
}
