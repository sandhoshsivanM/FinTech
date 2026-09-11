/**
 * Renders a `ReportWorkbook` to a styled .xlsx, in the browser or the desktop
 * shell. Nothing is uploaded; ExcelJS writes the bytes locally and `saveFile`
 * puts them where the user asks.
 *
 * ── Why ExcelJS and not SheetJS ────────────────────────────────────────────
 * The community build of SheetJS **cannot write cell styles at all** — no
 * fills, no fonts, no borders — and silently drops freeze panes on write. It
 * produced a technically correct workbook that looked like a text dump, which is
 * exactly the complaint that prompted this rewrite. ExcelJS writes styles,
 * frozen headers, autofilters and number formats, so the workbook arrives
 * looking like a report rather than a CSV that learned to have tabs.
 *
 * It is imported lazily: the library is large and only needed the moment
 * somebody exports, so it must not sit in the initial bundle.
 *
 * ── What makes this a spreadsheet somebody can use ─────────────────────────
 * The Summary sheet is formatted for a person to read. Every other sheet is
 * *tidy*: header in row 1, one row per record, no merged cells inside the data.
 * That is the difference between a workbook a finance team can pivot and one
 * they retype. Presentation and data are kept on separate sheets rather than
 * fought over on one.
 *
 * Three details that decide whether the file looks professional or broken:
 *
 *   1. **Amounts are numbers, not strings.** A column of text that looks like
 *      money makes SUM() return zero, and that is the first thing anyone tries.
 *   2. **Dates are real dates**, so Excel sorts them chronologically rather
 *      than alphabetically.
 *   3. **The totals row sits one blank row below the data**, outside the
 *      autofilter range — a total caught inside a filter gets re-sorted into the
 *      middle of the records and silently double-counts.
 */
import { saveFile, type SaveOutcome } from '@/lib/saveFile';
import type { CellValue, ReportSheet, ReportWorkbook } from './model';

/* -------------------------------------------------------------------------- */
/* Palette — the app's design tokens, as ARGB for Excel                       */
/* -------------------------------------------------------------------------- */

const INK = 'FF151815';
const ACCENT_DEEP = 'FF0D3B2E';
const ACCENT = 'FF176B4D';
const ACCENT_SOFT = 'FFEDF3EF';
const RULE = 'FFC7CFC9';
const ZEBRA = 'FFF7F9F7';
const EXPENSE = 'FFB54444';
const MUTED = 'FF5C635E';

/**
 * Number formats.
 *
 * `#,##0.00` rather than a currency symbol: the workbook states its currency on
 * the Summary and in every money column header, and a hardcoded ₹ would be wrong
 * for a vault kept in another currency.
 *
 * The percent format uses a literal `"%"` suffix, NOT Excel's `0.00%` code —
 * the model holds 50.2 meaning 50.2 per cent, and `0.00%` multiplies by 100 on
 * display and would render it as 5020%.
 */
const NUM_FORMAT: Record<string, string> = {
  money: '#,##0.00;[Red]-#,##0.00',
  number: '#,##0.00',
  integer: '#,##0',
  date: 'dd-mmm-yyyy',
  percent: '#,##0.0"%"',
};

const thin = { style: 'thin' as const, color: { argb: RULE } };
const allBorders = { top: thin, left: thin, bottom: thin, right: thin };

const isNumeric = (f: string) =>
  f === 'money' || f === 'number' || f === 'integer' || f === 'percent';

/** Column width in characters, with a floor so a short header stays legible. */
const widthOf = (w: number | undefined, header: string) =>
  Math.max(w ?? 12, header.length + 3);

/* -------------------------------------------------------------------------- */
/* Sheets                                                                     */
/* -------------------------------------------------------------------------- */

// Minimal structural types. ExcelJS is loaded dynamically, so its types are not
// available at module scope; these describe only what is touched here.
type Cell = {
  value: CellValue;
  numFmt?: string;
  font?: Record<string, unknown>;
  fill?: Record<string, unknown>;
  border?: Record<string, unknown>;
  alignment?: Record<string, unknown>;
};
type Row = { getCell(i: number): Cell; height?: number };
type Sheet = {
  columns: { width: number }[];
  addRow(v: unknown[]): Row;
  views: unknown[];
  autoFilter?: unknown;
};

function buildDataSheet(ws: Sheet, sheet: ReportSheet): void {
  const cols = sheet.columns;

  const header = ws.addRow(cols.map((c) => c.header));
  header.height = 24;
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.font = { bold: true, size: 9, color: { argb: ACCENT_DEEP } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_SOFT } };
    cell.border = { ...allBorders, bottom: { style: 'medium', color: { argb: ACCENT } } };
    cell.alignment = {
      horizontal: isNumeric(c.format) ? 'right' : 'left',
      vertical: 'middle',
      wrapText: true,
    };
  });

  sheet.rows.forEach((r, ri) => {
    const row = ws.addRow(cols.map((c) => (r[c.key] === undefined ? null : r[c.key])));
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const fmt = NUM_FORMAT[c.format];
      if (fmt) cell.numFmt = fmt;
      cell.border = allBorders;
      cell.alignment = { horizontal: isNumeric(c.format) ? 'right' : 'left', vertical: 'top' };
      const negative = c.format === 'money'
        && typeof r[c.key] === 'number' && (r[c.key] as number) < 0;
      // A negative amount is worth seeing at a glance rather than reading for.
      cell.font = { size: 10, color: { argb: negative ? EXPENSE : INK } };
      // Banded rows, which is what stops the eye losing its place across a wide
      // ledger.
      if (ri % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      }
    });
  });

  // Freeze the header. ExcelJS writes pane state properly — the SheetJS build
  // this replaced accepted the setting and then dropped it on write.
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  if (sheet.rows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: sheet.rows.length + 1, column: cols.length },
    };
  }

  if (sheet.totals) {
    // One blank row first, so the autofilter above can never reach the totals.
    ws.addRow([]);
    const totals = ws.addRow(
      cols.map((c) => (sheet.totals![c.key] === undefined ? null : sheet.totals![c.key])),
    );
    totals.height = 20;
    cols.forEach((c, i) => {
      const cell = totals.getCell(i + 1);
      const fmt = NUM_FORMAT[c.format];
      if (fmt) cell.numFmt = fmt;
      cell.font = { bold: true, size: 10, color: { argb: ACCENT_DEEP } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_SOFT } };
      cell.border = { ...allBorders, top: { style: 'medium', color: { argb: ACCENT } } };
      cell.alignment = { horizontal: isNumeric(c.format) ? 'right' : 'left' };
    });
  }

  ws.columns = cols.map((c) => ({ width: widthOf(c.width, c.header) }));
}

/** The one sheet formatted for a person rather than a pivot table. */
function buildSummarySheet(ws: Sheet, report: ReportWorkbook): void {
  const { meta } = report;

  const title = ws.addRow([`${meta.appName} — Financial report`]);
  title.height = 32;
  title.getCell(1).font = { bold: true, size: 18, color: { argb: ACCENT_DEEP } };

  const period = ws.addRow([meta.periodLabel]);
  period.getCell(1).font = { size: 11, color: { argb: MUTED } };

  ws.addRow([]);

  const metaRow = (label: string, value: CellValue, fmt?: string) => {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { size: 9, bold: true, color: { argb: MUTED } };
    const v = row.getCell(2);
    v.font = { size: 10, bold: true, color: { argb: INK } };
    if (fmt) v.numFmt = fmt;
  };
  metaRow('PROFILE', meta.profileName);
  metaRow('CURRENCY', meta.currencyCode);
  metaRow('PERIOD START', meta.periodStart, NUM_FORMAT.date);
  metaRow('PERIOD END', meta.periodEnd, NUM_FORMAT.date);
  metaRow('GENERATED', meta.generatedAt, NUM_FORMAT.date);
  metaRow('VERSION', meta.appVersion);

  if (!meta.ledgerBalanced) {
    ws.addRow([]);
    const warn = ws.addRow([
      'WARNING — the books do not balance',
      meta.discrepancy,
      'An entry whose postings do not sum to zero, or a posting against an account not in the chart. See the Balance sheet tab.',
    ]);
    warn.getCell(1).font = { bold: true, size: 11, color: { argb: EXPENSE } };
    warn.getCell(2).numFmt = NUM_FORMAT.money;
    warn.getCell(2).font = { bold: true, color: { argb: EXPENSE } };
    warn.getCell(3).font = { size: 9, color: { argb: MUTED } };
  }

  for (const group of report.summary) {
    ws.addRow([]);
    const head = ws.addRow([group.heading]);
    head.height = 20;
    for (const i of [1, 2, 3]) {
      const c = head.getCell(i);
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_DEEP } };
      c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      c.alignment = { vertical: 'middle' };
    }

    for (const s of group.stats) {
      const row = ws.addRow([s.label, s.value, s.hint ?? '']);
      row.height = 18;
      row.getCell(1).font = { size: 10, color: { argb: MUTED } };
      const v = row.getCell(2);
      const fmt = NUM_FORMAT[s.format];
      if (fmt) v.numFmt = fmt;
      v.font = {
        bold: true,
        size: 12,
        color: { argb: typeof s.value === 'number' && s.value < 0 ? EXPENSE : INK },
      };
      v.alignment = { horizontal: 'right' };
      row.getCell(3).font = { size: 9, color: { argb: MUTED } };
      for (const i of [1, 2, 3]) row.getCell(i).border = allBorders;
    }
  }

  ws.addRow([]);
  const foot = ws.addRow([
    'Every other sheet is plain tabular data: one row per record, header in row 1, no merged cells — so it can be filtered and pivoted directly.',
  ]);
  foot.getCell(1).font = { italic: true, size: 9, color: { argb: MUTED } };

  ws.columns = [{ width: 34 }, { width: 22 }, { width: 62 }];
  ws.views = [{ state: 'frozen', ySplit: 2 }];
}

/* -------------------------------------------------------------------------- */
/* Entry points                                                               */
/* -------------------------------------------------------------------------- */

/** Builds the styled workbook and returns the .xlsx bytes. */
export async function buildXlsx(report: ReportWorkbook): Promise<Uint8Array> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = report.meta.appName;
  wb.created = report.meta.generatedAt;

  buildSummarySheet(wb.addWorksheet('Summary') as unknown as Sheet, report);
  for (const sheet of report.sheets) {
    // Landscape for the wide tables, so a ten-column sheet prints without
    // spilling its last column onto a second page.
    const ws = wb.addWorksheet(sheet.name, {
      pageSetup: {
        orientation: sheet.columns.length >= 8 ? 'landscape' : 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });
    buildDataSheet(ws as unknown as Sheet, sheet);
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/** A filesystem-safe filename that sorts chronologically. */
export function reportFilename(report: ReportWorkbook, ext: string): string {
  const iso = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  return `khazana-report_${iso(report.meta.periodStart)}_${iso(report.meta.periodEnd)}.${ext}`;
}

/** Writes the workbook and saves it, reporting what actually happened. */
export async function downloadXlsx(report: ReportWorkbook): Promise<SaveOutcome> {
  return saveFile({
    filename: reportFilename(report, 'xlsx'),
    data: await buildXlsx(report),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filter: { name: 'Excel workbook', extensions: ['xlsx'] },
  });
}
