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
import { loadReportAssets, type ReportAssets } from './assets';

/* -------------------------------------------------------------------------- */
/* Palette — Zentra tokens, as ARGB for Excel                                 */
/* -------------------------------------------------------------------------- */
//
// Light and print-friendly: near-black ink, grey trays, colour kept for meaning
// (green in, pink out, amber for warnings). Header bands are the app's black
// pill, the same choice the PDF makes.

const INK = 'FF111214';
const INK_SOFT = 'FF5C5C61';
const MUTED = 'FF8E8E93';
const LINE = 'FFE6E6E8';
const TRAY = 'FFF2F2F2';
const CARD = 'FFF8F8F8';
const WHITE = 'FFFFFFFF';
const GREEN = 'FF0BA722';
const PINK = 'FFF33688';
const AMBER = 'FFE39A16';

/**
 * The face. Anek Latin is the app's, but it is not installed on the machines
 * that open these files and Excel would silently substitute; Calibri is on
 * every copy of Office and renders predictably in Numbers and LibreOffice.
 */
const FONT = 'Calibri';
const font = (size: number, color: string, extra: Record<string, unknown> = {}) =>
  ({ name: FONT, size, color: { argb: color }, ...extra });
const solid = (argb: string) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

/** The data colour a figure earns — mirrors `toneOf` in the PDF. */
function toneOf(key: string, v: CellValue): string | null {
  if (typeof v !== 'number' || v === 0) return null;
  if (key === 'income') return GREEN;
  if (key === 'expense') return PINK;
  if (key === 'net' || key === 'gain' || key === 'gainPct') return v > 0 ? GREEN : PINK;
  return v < 0 ? PINK : null;
}

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
  // Sign only: the colour comes from the cell font (Zentra pink), not Excel's
  // stock [Red], which is a different red from everything else in the file.
  money: '#,##0.00;-#,##0.00',
  number: '#,##0.00',
  integer: '#,##0',
  date: 'dd-mmm-yyyy',
  percent: '#,##0.0"%"',
};

const hair = { style: 'thin' as const, color: { argb: LINE } };
/** Horizontal rules only — vertical grid lines are what make a sheet look like a form. */
const rules = { top: hair, bottom: hair };

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
  headerFooter: { oddFooter?: string };
  addImage(id: number, range: unknown): void;
};

/**
 * A value as Excel should store it. Dates are wall-clock: ExcelJS serialises a
 * `Date` by its UTC instant, so in India a period starting at local midnight
 * (18:30 UTC the day before) displayed as the previous day. Re-expressing the
 * local fields as UTC makes the cell show the date the user actually chose.
 */
function cellOf(v: CellValue | undefined): CellValue {
  if (v === undefined) return null;
  if (v instanceof Date) {
    return new Date(Date.UTC(
      v.getFullYear(), v.getMonth(), v.getDate(),
      v.getHours(), v.getMinutes(), v.getSeconds(), v.getMilliseconds(),
    ));
  }
  return v;
}

/** Excel header/footer codes treat `&` as an escape; double it in free text. */
const hf = (s: string) => s.replace(/&/g, '&&');

/** Page footer for print: what this is on the left, page numbers on the right. */
function printFooter(ws: Sheet, report: ReportWorkbook): void {
  ws.headerFooter.oddFooter =
    `&L&"${FONT}"&8${hf(`${report.meta.appName} · ${report.meta.periodLabel}`)}&R&"${FONT}"&8Page &P of &N`;
}

function buildDataSheet(ws: Sheet, sheet: ReportSheet): void {
  const cols = sheet.columns;

  // The black pill: near-black band, white type.
  const header = ws.addRow(cols.map((c) => c.header));
  header.height = 26;
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.font = font(10, WHITE, { bold: true });
    cell.fill = solid(INK);
    cell.border = { bottom: { style: 'medium', color: { argb: INK } } };
    cell.alignment = {
      horizontal: isNumeric(c.format) ? 'right' : 'left',
      vertical: 'middle',
      wrapText: true,
      indent: 1,
    };
  });

  sheet.rows.forEach((r, ri) => {
    const row = ws.addRow(cols.map((c) => cellOf(r[c.key])));
    row.height = 18;
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const fmt = NUM_FORMAT[c.format];
      if (fmt) cell.numFmt = fmt;
      cell.border = rules;
      cell.alignment = {
        horizontal: isNumeric(c.format) ? 'right' : 'left',
        vertical: 'middle',
        indent: 1,
      };
      // Income green, expense pink, a negative amount pink: the colour is
      // worth seeing at a glance rather than reading for.
      const tone = isNumeric(c.format) ? toneOf(c.key, r[c.key] ?? null) : null;
      cell.font = font(10, tone ?? INK);
      // Banded rows, which is what stops the eye losing its place across a wide
      // ledger.
      if (ri % 2 === 1) cell.fill = solid(TRAY);
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
      cols.map((c) => cellOf(sheet.totals![c.key])),
    );
    totals.height = 22;
    cols.forEach((c, i) => {
      const cell = totals.getCell(i + 1);
      const fmt = NUM_FORMAT[c.format];
      if (fmt) cell.numFmt = fmt;
      const tone = isNumeric(c.format) ? toneOf(c.key, sheet.totals![c.key] ?? null) : null;
      cell.font = font(10.5, tone ?? INK, { bold: true });
      cell.border = { top: { style: 'medium', color: { argb: INK } } };
      cell.alignment = {
        horizontal: isNumeric(c.format) ? 'right' : 'left',
        vertical: 'middle',
        indent: 1,
      };
    });
  }

  ws.columns = cols.map((c) => ({ width: widthOf(c.width, c.header) }));
}

/**
 * The one sheet formatted for a person rather than a pivot table — the cover.
 * `logoId` is the workbook image id of the brand mark, when it could be loaded.
 */
function buildSummarySheet(ws: Sheet, report: ReportWorkbook, logoId: number | null): void {
  const { meta } = report;
  const span = [1, 2, 3];

  // Masthead: the mark floating over A1, the letter-spaced wordmark beside it.
  // Excel has no tracking, so the spacing is literal — this is the one label
  // in the file allowed to look like that.
  const brand = ws.addRow([meta.appName.toUpperCase().split('').join(' ')]);
  brand.height = 34;
  brand.getCell(1).font = font(11, INK, { bold: true });
  // Six indent levels (~one character each) clear the 30 px mark with room to
  // spare in Excel, Numbers and LibreOffice alike.
  brand.getCell(1).alignment = { vertical: 'middle', indent: logoId === null ? 0 : 6 };
  if (logoId !== null) {
    ws.addImage(logoId, {
      tl: { col: 0.03, row: 0.15 },
      ext: { width: 30, height: 30 },
      editAs: 'oneCell',
    });
  }

  const title = ws.addRow(['Financial report']);
  title.height = 36;
  // Big figure, light treatment: large and not bold.
  title.getCell(1).font = font(24, INK);
  title.getCell(1).alignment = { vertical: 'bottom' };

  const period = ws.addRow([meta.periodLabel]);
  period.height = 20;
  period.getCell(1).font = font(12, INK_SOFT);

  ws.addRow([]);

  const metaRow = (label: string, value: CellValue, fmt?: string) => {
    const row = ws.addRow([label, cellOf(value)]);
    row.height = 18;
    for (const i of span) {
      const c = row.getCell(i);
      c.fill = solid(CARD);
      c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    }
    row.getCell(1).font = font(10, INK_SOFT);
    const v = row.getCell(2);
    v.font = font(11, INK, { bold: true });
    if (fmt) v.numFmt = fmt;
  };
  metaRow('Profile', meta.profileName);
  metaRow('Currency', meta.currencyCode);
  metaRow('Period start', meta.periodStart, NUM_FORMAT.date);
  metaRow('Period end', meta.periodEnd, NUM_FORMAT.date);
  metaRow('Generated', meta.generatedAt, NUM_FORMAT.date);
  metaRow('Version', meta.appVersion);

  if (!meta.ledgerBalanced) {
    ws.addRow([]);
    const warn = ws.addRow([
      'Warning — the books do not balance',
      meta.discrepancy,
      'An entry whose postings do not sum to zero, or a posting against an account not in the chart. See the Balance sheet tab.',
    ]);
    warn.height = 30;
    for (const i of span) {
      const c = warn.getCell(i);
      c.fill = solid('FFFCF5E8');
      c.border = { left: i === 1 ? { style: 'thick', color: { argb: AMBER } } : undefined };
      c.alignment = { vertical: 'middle', wrapText: i === 3, indent: 1 };
    }
    warn.getCell(1).font = font(11, INK, { bold: true });
    warn.getCell(2).numFmt = NUM_FORMAT.money;
    warn.getCell(2).font = font(11, AMBER, { bold: true });
    warn.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    warn.getCell(3).font = font(9, INK_SOFT);
  }

  report.summary.forEach((group, gi) => {
    ws.addRow([]);
    // Same black pill as the data sheets' headers.
    const head = ws.addRow([group.heading]);
    head.height = 24;
    for (const i of span) {
      const c = head.getCell(i);
      c.fill = solid(INK);
      c.font = font(11, WHITE, { bold: true });
      c.alignment = { vertical: 'middle', indent: 1 };
    }

    group.stats.forEach((s, si) => {
      const row = ws.addRow([s.label, cellOf(s.value), s.hint ?? '']);
      row.height = 24;
      const label = row.getCell(1);
      label.font = font(10.5, INK_SOFT);
      label.alignment = { vertical: 'middle', indent: 1 };
      const v = row.getCell(2);
      const fmt = NUM_FORMAT[s.format];
      if (fmt) v.numFmt = fmt;
      // Income and expenses lead the report, so they carry their colours;
      // after that a figure is coloured only when it is negative.
      const negative = typeof s.value === 'number' && s.value < 0;
      const tone = negative ? PINK : gi === 0 && si === 0 ? GREEN : gi === 0 && si === 1 ? PINK : INK;
      // Big figures: larger, not bold — the app's light numerals.
      v.font = font(14, tone);
      v.alignment = { horizontal: 'right', vertical: 'middle' };
      const hint = row.getCell(3);
      hint.font = font(9, INK_SOFT);
      hint.alignment = { vertical: 'middle', indent: 1 };
      for (const i of span) row.getCell(i).border = { bottom: hair };
    });
  });

  ws.addRow([]);
  const foot = ws.addRow([
    'Every other sheet is plain tabular data: one row per record, header in row 1, no merged cells — so it can be filtered and pivoted directly.',
  ]);
  foot.getCell(1).font = font(9, MUTED, { italic: true });

  ws.columns = [{ width: 34 }, { width: 24 }, { width: 62 }];
  // A cover, not a grid: no gridlines, and the title stays put while scrolling.
  ws.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }];
}

/* -------------------------------------------------------------------------- */
/* Entry points                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Builds the styled workbook and returns the .xlsx bytes. `assets` is for
 * callers that already hold the logo (tests, scripts); the app fetches it.
 */
export async function buildXlsx(report: ReportWorkbook, assets?: ReportAssets): Promise<Uint8Array> {
  const ExcelJS = (await import('exceljs')).default;
  const { logoPng } = assets ?? await loadReportAssets();
  const wb = new ExcelJS.Workbook();
  wb.creator = report.meta.appName;
  wb.created = report.meta.generatedAt;
  wb.title = `${report.meta.appName} financial report — ${report.meta.periodLabel}`;
  wb.subject = `Financial report for ${report.meta.profileName}`;

  let logoId: number | null = null;
  if (logoPng) {
    try {
      logoId = wb.addImage({ base64: logoPng, extension: 'png' });
    } catch {
      logoId = null;
    }
  }

  const summary = wb.addWorksheet('Summary', {
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  }) as unknown as Sheet;
  buildSummarySheet(summary, report, logoId);
  printFooter(summary, report);

  for (const sheet of report.sheets) {
    // Landscape for the wide tables, so a ten-column sheet prints without
    // spilling its last column onto a second page.
    const ws = wb.addWorksheet(sheet.name, {
      pageSetup: {
        orientation: sheet.columns.length >= 8 ? 'landscape' : 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        // The header band repeats on every printed page.
        printTitlesRow: '1:1',
      },
    }) as unknown as Sheet;
    buildDataSheet(ws, sheet);
    printFooter(ws, report);
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
