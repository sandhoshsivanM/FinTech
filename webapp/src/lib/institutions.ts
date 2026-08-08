/**
 * Brokers and banks the import screen offers, with how to get a file out of
 * each one.
 *
 * These entries carry *instructions*, not parsers. Column layouts are handled
 * generically (see `holdingsCsv.ts` and `txnImport.ts`), which is why the UI
 * can honestly say that picking the wrong institution still works — the choice
 * selects guidance and a couple of parsing hints, never a code path that can
 * reject a valid file.
 *
 * `initials` and `color` render a text badge rather than a bundled logo:
 * shipping bank trademarks would bloat the export and invite a licensing
 * question for zero functional gain.
 */

export interface Institution {
  id: string;
  name: string;
  initials: string;
  color: string;
  /** Ordered how-to-export steps. Markdown-free; links go in `links`. */
  steps: string[];
  links?: { label: string; href: string }[];
  /** Shown under the steps when the export has a quirk worth stating. */
  note?: string;
}

/* ---- Brokers & depositories (Assets tab) --------------------------------- */

export const BROKERS: Institution[] = [
  {
    id: 'zerodha', name: 'Zerodha', initials: 'Z', color: '#387ED1',
    steps: [
      'Log in to Kite',
      'Go to Holdings',
      'Click the download icon and choose CSV',
      'Upload the downloaded file below',
    ],
    links: [{ label: 'kite.zerodha.com', href: 'https://kite.zerodha.com' }],
    note: 'Console → Portfolio → Holdings also exports XLSX, which works here too.',
  },
  {
    id: 'groww', name: 'Groww', initials: 'G', color: '#00D09C',
    steps: [
      'Open Groww on web',
      'Go to Stocks → Holdings',
      'Click Download and pick the holdings report',
      'Upload the file below',
    ],
    note: "Groww exports today's P&L rather than a previous close. The importer derives the close from it, so the day-change column still works.",
  },
  {
    id: 'indmoney', name: 'INDmoney', initials: 'IN', color: '#1B1B1B',
    steps: ['Open INDmoney on web', 'Go to Portfolio → Stocks', 'Export the holdings report', 'Upload the file below'],
  },
  {
    id: 'upstox', name: 'Upstox', initials: 'U', color: '#7C3AED',
    steps: ['Log in to Upstox', 'Go to Portfolio → Holdings', 'Download the holdings report', 'Upload the file below'],
    note: "Upstox publishes day P&L instead of a previous close; the importer converts it.",
  },
  {
    id: 'icicidirect', name: 'ICICI Direct', initials: 'I', color: '#F26522',
    steps: ['Log in to ICICI Direct', 'Portfolio → Equity → Holdings', 'Export to Excel', 'Upload the file below'],
  },
  {
    id: 'cdsl', name: 'CDSL', initials: 'C', color: '#0F5298',
    steps: [
      'Log in to CDSL Easi',
      'Go to Holdings Statement',
      'Export as CSV or Excel',
      'Upload the file below',
    ],
    note: 'A depository statement lists ISIN and quantity but usually no average cost — rows without a cost are reported as skipped rather than imported at zero.',
  },
  {
    id: 'angelone', name: 'Angel One', initials: 'A', color: '#E5322D',
    steps: ['Log in to Angel One', 'Portfolio → Holdings', 'Download the report', 'Upload the file below'],
  },
  {
    id: 'aionion', name: 'Aionion', initials: 'A', color: '#166534',
    steps: ['Log in to Aionion', 'Open Holdings', 'Export the holdings report', 'Upload the file below'],
  },
  {
    id: 'chola', name: 'Chola Securities', initials: 'CS', color: '#B91C1C',
    steps: ['Log in to Chola Securities', 'Portfolio → Holdings', 'Export the report', 'Upload the file below'],
  },
  {
    id: 'mstock', name: 'mstock', initials: 'M', color: '#DC2626',
    steps: ['Log in to mstock', 'Portfolio → Holdings', 'Download as CSV', 'Upload the file below'],
  },
  {
    id: '5paisa', name: '5paisa', initials: '5p', color: '#2563EB',
    steps: ['Log in to 5paisa', 'Portfolio → Equity Holdings', 'Export the report', 'Upload the file below'],
  },
  {
    id: 'vested', name: 'Vested', initials: 'V', color: '#059669',
    steps: ['Log in to Vested', 'Portfolio → Holdings', 'Export the holdings CSV', 'Upload the file below'],
    note: 'US holdings are priced in USD. Import them as their own asset class and set the currency in Settings — the importer does not convert.',
  },
  {
    id: 'tickertape', name: 'Tickertape', initials: 'TT', color: '#EA580C',
    steps: ['Log in to Tickertape', 'Open your Portfolio', 'Export holdings as CSV', 'Upload the file below'],
  },
  {
    id: 'stockal', name: 'Stockal', initials: 'St', color: '#1D4ED8',
    steps: ['Log in to Stockal', 'Portfolio → Holdings', 'Export the report', 'Upload the file below'],
    note: 'US holdings are priced in USD; the importer does not convert currency.',
  },
  {
    id: 'ibkr', name: 'Interactive Brokers', initials: 'IB', color: '#B91C1C',
    steps: [
      'Log in to Client Portal',
      'Performance & Reports → Flex Queries (or Statements)',
      'Run a Positions report and download as CSV',
      'Upload the file below',
    ],
    note: 'IBKR statements contain several stacked sections. The importer finds the positions header automatically and ignores the rest.',
  },
  {
    id: 'kuvera', name: 'Kuvera', initials: 'K', color: '#7C3AED',
    steps: ['Log in to Kuvera', 'Go to Reports → Holdings', 'Download the report', 'Upload the file below'],
    note: 'Mutual funds — import these as Equity Funds or Debt Funds rather than stocks.',
  },
  {
    id: 'mfcentral', name: 'MFCentral CAS', initials: 'MF', color: '#0F766E',
    steps: [
      'Log in to MFCentral',
      'Request a Consolidated Account Statement (CAS)',
      'Download the CAS as Excel — the PDF version cannot be imported',
      'Upload the file below',
    ],
    note: 'A password-protected CAS must have its password removed before upload; the importer cannot decrypt it.',
  },
  {
    id: 'kotakneo', name: 'Kotak Neo', initials: 'K', color: '#DC2626',
    steps: ['Log in to Kotak Neo', 'Portfolio → Holdings', 'Download the holdings report', 'Upload the file below'],
  },
];

/* ---- Banks (Income & Expenses tab) --------------------------------------- */

export interface BankGroup {
  country: string;
  banks: Institution[];
}

export const BANK_GROUPS: BankGroup[] = [
  {
    country: 'India',
    banks: [
      {
        id: 'hdfc', name: 'HDFC Bank', initials: 'HD', color: '#004C8F',
        steps: [
          'Log in to NetBanking',
          'Go to Accounts → Statement',
          'Pick the date range you want to import',
          'Download as Delimited (.txt), CSV, or Excel (.xls) — all three work',
          'Upload the file below',
        ],
        links: [{ label: 'netbanking.hdfcbank.com', href: 'https://netbanking.hdfcbank.com' }],
        note: 'HDFC prepends account details above the column titles. The importer scans past them to find the real header row.',
      },
      {
        id: 'sbi', name: 'State Bank of India', initials: 'SBI', color: '#1F4E9C',
        steps: [
          'Log in to OnlineSBI / YONO',
          'Go to Account Statement',
          'Choose the date range and "Download in CSV / XLS"',
          'Upload the file below',
        ],
        note: 'SBI exports carry a multi-line header block and a trailing summary; both are skipped automatically.',
      },
      {
        id: 'icici', name: 'ICICI Bank', initials: 'IC', color: '#AE275F',
        steps: [
          'Log in to iMobile or Internet Banking',
          'Accounts → Statement / Transaction history',
          'Select the period and export to Excel or CSV',
          'Upload the file below',
        ],
      },
      {
        id: 'idfc', name: 'IDFC FIRST Bank', initials: 'ID', color: '#9B1C31',
        steps: [
          'Log in to IDFC FIRST net banking',
          'Accounts → Account Statement',
          'Pick the range and download as CSV or Excel',
          'Upload the file below',
        ],
      },
      {
        id: 'kotak', name: 'Kotak Mahindra Bank', initials: 'KO', color: '#ED1C24',
        steps: [
          'Log in to Kotak net banking',
          'Go to Accounts → Account Statement',
          'Choose the range and export as CSV or Excel',
          'Upload the file below',
        ],
      },
    ],
  },
  {
    country: 'Qatar',
    banks: [
      {
        id: 'doha', name: 'Doha Bank', initials: 'DB', color: '#9D2235',
        steps: [
          'Log in to Doha Bank internet banking',
          'Accounts → Account Statement',
          'Select the period and export to Excel or CSV',
          'Upload the file below',
        ],
        note: 'Statements are in QAR. Set your display currency in Settings — the importer stores the figures as-is and does not convert.',
      },
      {
        id: 'cbq', name: 'Commercial Bank of Qatar', initials: 'CB', color: '#003B71',
        steps: [
          'Log in to CBQ internet banking',
          'Accounts → Statement',
          'Choose the date range and download as CSV or Excel',
          'Upload the file below',
        ],
        note: 'Statements are in QAR; figures are stored as exported, with no conversion.',
      },
    ],
  },
];

export const ALL_BANKS: Institution[] = BANK_GROUPS.flatMap((g) => g.banks);

export const findBroker = (id: string) => BROKERS.find((b) => b.id === id);
export const findBank = (id: string) => ALL_BANKS.find((b) => b.id === id);
