/**
 * The PDF is drawn, not templated, so these pin the two things a reader would
 * notice first: that a file comes out at all — with or without the embedded
 * face — and that the face it embeds is the app's, carrying a real ₹.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { custom } from '@khazana/domain/period';
import { buildReport, type ReportInput } from '@khazana/screens/lib/reports/model';
import { buildPdf } from '@khazana/screens/lib/reports/pdf';
import { EMPTY_ASSETS } from '@khazana/screens/lib/reports/assets';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const input: ReportInput = {
  accounts: [],
  categories: [],
  postings: [],
  txns: [{ id: 't1', vaultId: 'v', amount: '1500', type: 'expense', categoryId: null, date: day(2026, 3, 5), createdAt: day(2026, 3, 5), accountId: 'a' }],
  transfers: [],
  holdings: [],
  currencyCode: 'INR',
  profileName: 'Self',
  appVersion: '1.0.0',
} as unknown as ReportInput;
const report = buildReport(input, custom(day(2026, 3, 1), day(2026, 3, 31)), day(2026, 4, 1));

const pub = (f: string) => readFileSync(join(process.cwd(), 'public', f)).toString('base64');
const latin1 = (b: Uint8Array) => Buffer.from(b).toString('latin1');

describe('pdf rendering', () => {
  it('still renders when the fonts and logo could not be loaded', async () => {
    const bytes = await buildPdf(report, EMPTY_ASSETS);
    expect(latin1(bytes.slice(0, 5))).toBe('%PDF-');
    expect(latin1(bytes)).not.toContain('/AnekLight');
  });

  it('embeds Anek Latin and the brand mark, and carries title metadata', async () => {
    const bytes = await buildPdf(report, {
      logoPng: pub('khazana-mark.png'),
      fonts: {
        light: pub('fonts/AnekLatin-Light.ttf'),
        regular: pub('fonts/AnekLatin-Regular.ttf'),
        medium: pub('fonts/AnekLatin-Medium.ttf'),
      },
    });
    const text = latin1(bytes);
    expect(text).toContain('/BaseFont /AnekLight');
    expect(text).toContain('/BaseFont /AnekMedium');
    expect(text).toContain('/Subtype /Image');
    expect(text).toContain('/Title (');
    expect(text).toContain('/Author (Khazana)');
  });
});
