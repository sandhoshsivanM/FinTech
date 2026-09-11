/**
 * Renders a `ReportWorkbook` to a genuine PDF file.
 *
 * ── Why this replaced the print dialog ─────────────────────────────────────
 * The first version handed a styled HTML document to the browser's print
 * pipeline and let the user choose "Save as PDF". That worked in a browser and
 * was useless in the desktop shell, where the webview has no print pipeline at
 * all — so the desktop build fell back to saving an `.html` file, and a button
 * labelled "Export PDF" that produces an HTML file is simply wrong.
 *
 * jsPDF draws the document directly, so both builds now produce the same real
 * `.pdf` with selectable, searchable text — no rasterising, no print dialog, no
 * platform branch. It is imported lazily so it stays out of the initial bundle.
 *
 * Nothing leaves the device: the bytes are generated here and handed to
 * `saveFile`.
 */
import { saveFile, type SaveOutcome } from '@/lib/saveFile';
import { formatReportDate, type CellValue, type ReportSheet, type ReportWorkbook } from './model';
import { reportFilename } from './xlsx';

/* -------------------------------------------------------------------------- */
/* Palette — the app's design tokens as RGB triples                           */
/* -------------------------------------------------------------------------- */

type RGB = [number, number, number];

const ACCENT_DEEP: RGB = [13, 59, 46];
const ACCENT: RGB = [23, 107, 77];
const ACCENT_SOFT: RGB = [237, 243, 239];
const GOLD: RGB = [201, 154, 61];
const INK: RGB = [21, 24, 21];
const INK_SOFT: RGB = [92, 99, 94];
const MUTED: RGB = [139, 147, 141];
const RULE: RGB = [199, 207, 201];
const ZEBRA: RGB = [247, 249, 247];
const INCOME: RGB = [25, 115, 77];
const EXPENSE: RGB = [181, 68, 68];
const WHITE: RGB = [255, 255, 255];

const MARGIN = 12;

const isNumeric = (f: string) =>
  f === 'money' || f === 'number' || f === 'integer' || f === 'percent';

/**
 * Maps characters the PDF's standard fonts cannot encode.
 *
 * jsPDF's built-in Helvetica uses WinAnsi, which has no U+2212 MINUS SIGN — the
 * ledger's labels use it ("Assets − liabilities") and it rendered as a stray
 * quote mark. En and em dashes ARE in WinAnsi and are left alone. Applied to
 * every string that reaches the page, because one unmapped glyph in a figure
 * label is enough to make the whole document look broken.
 */
export const winAnsi = (v: string): string => v
  .replace(/\u2212/g, '-')
  .replace(/\u00a0/g, ' ')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"');

/** Cell text. Mirrors the spreadsheet's formats so the two agree on screen. */
function fmt(v: CellValue, format: string, currency: string): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return formatReportDate(v);
  if (typeof v === 'number') {
    if (format === 'integer') return v.toLocaleString();
    if (format === 'percent') {
      return `${v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    }
    const n = v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return winAnsi(format === 'money' ? `${currency} ${n}` : n);
  }
  return winAnsi(String(v));
}

const num = (v: CellValue): number => (typeof v === 'number' ? v : 0);

/* -------------------------------------------------------------------------- */
/* Build                                                                      */
/* -------------------------------------------------------------------------- */

/** Generates the PDF and returns its bytes. */
export async function buildPdf(report: ReportWorkbook): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - MARGIN * 2;
  const { meta } = report;

  /* ---- Masthead --------------------------------------------------------- */
  // A solid block with a gold rule under it. Flat colour on purpose: a diagonal
  // gradient reads as a template rather than a document someone set.
  doc.setFillColor(...ACCENT_DEEP);
  doc.rect(0, 0, pageW, 34, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 34, pageW, 1.2, 'F');

  doc.setTextColor(169, 216, 194);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(meta.appName.toUpperCase().split('').join(' '), MARGIN, 12);

  doc.setTextColor(...WHITE);
  doc.setFontSize(21);
  doc.text('Financial report', MARGIN, 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(197, 216, 206);
  doc.text(winAnsi(meta.periodLabel), MARGIN, 29);

  let y = 42;

  /* ---- Meta strip ------------------------------------------------------- */
  const metaCells: [string, string][] = [
    ['PROFILE', meta.profileName],
    ['CURRENCY', meta.currencyCode],
    ['PERIOD', `${formatReportDate(meta.periodStart)} – ${formatReportDate(meta.periodEnd)}`],
    ['GENERATED', formatReportDate(meta.generatedAt)],
    ['VERSION', meta.appVersion],
  ];
  const cellW = contentW / metaCells.length;
  doc.setFillColor(...ACCENT_SOFT);
  doc.rect(MARGIN, y, contentW, 14, 'F');
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN, y, contentW, 14, 'S');
  metaCells.forEach(([label, value], i) => {
    const x = MARGIN + i * cellW;
    if (i > 0) doc.line(x, y, x, y + 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...INK_SOFT);
    doc.text(label, x + 2.5, y + 4.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text(winAnsi(value), x + 2.5, y + 9.5, { maxWidth: cellW - 5 });
  });
  y += 20;

  /* ---- Unbalanced-ledger warning ---------------------------------------- */
  if (!meta.ledgerBalanced) {
    doc.setFillColor(251, 239, 239);
    doc.rect(MARGIN, y, contentW, 12, 'F');
    doc.setFillColor(...EXPENSE);
    doc.rect(MARGIN, y, 1.2, 12, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(122, 46, 46);
    doc.text('The books do not balance.', MARGIN + 4, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(
      `Discrepancy ${fmt(meta.discrepancy, 'money', meta.currencyCode)} — an entry whose postings do not sum to zero, or a posting against an account not in the chart.`,
      MARGIN + 4, y + 9, { maxWidth: contentW - 8 },
    );
    y += 16;
  }

  /* ---- KPI tiles -------------------------------------------------------- */
  for (const group of report.summary) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...ACCENT_DEEP);
    doc.text(winAnsi(group.heading.toUpperCase()), MARGIN, y);
    doc.setDrawColor(...RULE);
    doc.line(MARGIN, y + 1.5, MARGIN + contentW, y + 1.5);
    y += 5;

    // A fixed five-column grid: with a flowing layout a group of five tiles
    // stretches the last one across the full width, which reads as a mistake.
    const cols = 5;
    const gap = 2;
    const tileW = (contentW - gap * (cols - 1)) / cols;
    const tileH = 18;

    group.stats.forEach((s, i) => {
      const col = i % cols;
      const rowN = Math.floor(i / cols);
      const x = MARGIN + col * (tileW + gap);
      const ty = y + rowN * (tileH + gap);

      doc.setFillColor(...WHITE);
      doc.setDrawColor(...RULE);
      doc.rect(x, ty, tileW, tileH, 'FD');

      // Filled label strip, tinted by meaning for the first two tiles.
      const tone: RGB = i === 0 && group === report.summary[0]
        ? [232, 241, 236]
        : i === 1 && group === report.summary[0]
          ? [248, 237, 237]
          : ACCENT_SOFT;
      doc.setFillColor(...tone);
      doc.rect(x, ty, tileW, 5, 'F');
      doc.setDrawColor(...RULE);
      doc.line(x, ty + 5, x + tileW, ty + 5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.setTextColor(...INK_SOFT);
      doc.text(winAnsi(s.label.toUpperCase()), x + 2, ty + 3.4, { maxWidth: tileW - 4 });

      const negative = typeof s.value === 'number' && s.value < 0;
      doc.setFontSize(9.5);
      doc.setTextColor(...(negative ? EXPENSE : INK));
      doc.text(fmt(s.value, s.format, meta.currencyCode), x + 2, ty + 10.5, {
        maxWidth: tileW - 4,
      });

      if (s.hint) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5);
        doc.setTextColor(...MUTED);
        doc.text(winAnsi(s.hint), x + 2, ty + 14, { maxWidth: tileW - 4 });
      }
    });

    y += Math.ceil(group.stats.length / cols) * (tileH + gap) + 5;
  }

  /* ---- Sections --------------------------------------------------------- */
  for (const sheet of report.sheets) {
    y = drawSectionHeader(doc, sheet, y, contentW);
    y = drawChart(doc, sheet, y, contentW, meta.currencyCode);

    const wide = sheet.columns.length >= 8;
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, top: MARGIN },
      head: [sheet.columns.map((c) => winAnsi(c.header))],
      body: sheet.rows.map((r) =>
        sheet.columns.map((c) => fmt(r[c.key] ?? null, c.format, meta.currencyCode))),
      foot: sheet.totals
        ? [sheet.columns.map((c) => fmt(sheet.totals![c.key] ?? null, c.format, meta.currencyCode))]
        : undefined,
      theme: 'grid',
      styles: {
        fontSize: wide ? 5.6 : 7,
        cellPadding: wide ? 1 : 1.5,
        lineColor: RULE,
        lineWidth: 0.1,
        textColor: INK,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: ACCENT_SOFT,
        textColor: ACCENT_DEEP,
        fontStyle: 'bold',
        fontSize: wide ? 5.4 : 6.4,
        lineColor: RULE,
        lineWidth: 0.1,
      },
      footStyles: {
        fillColor: ACCENT_SOFT,
        textColor: ACCENT_DEEP,
        fontStyle: 'bold',
        fontSize: wide ? 5.6 : 7,
        lineColor: RULE,
        lineWidth: 0.1,
      },
      alternateRowStyles: { fillColor: ZEBRA },
      columnStyles: Object.fromEntries(
        sheet.columns.map((c, i) => [i, { halign: isNumeric(c.format) ? 'right' : 'left' }]),
      ),
    });

    // @ts-expect-error — autoTable stores its cursor on the document.
    y = (doc.lastAutoTable?.finalY ?? y) + 8;
  }

  /* ---- Footer on every page --------------------------------------------- */
  const pages = doc.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, pageH - 10, MARGIN + contentW, pageH - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(winAnsi(`${meta.appName} · ${meta.periodLabel}`), MARGIN, pageH - 6);
    doc.text(`Page ${p} of ${pages}`, MARGIN + contentW, pageH - 6, { align: 'right' });
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

/* -------------------------------------------------------------------------- */
/* Section furniture                                                          */
/* -------------------------------------------------------------------------- */

type Doc = Awaited<ReturnType<typeof buildPdf>> extends never ? never : any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A filled title bar, and the section's note under it. */
function drawSectionHeader(doc: Doc, sheet: ReportSheet, yIn: number, contentW: number): number {
  let y = yIn;
  const pageH = doc.internal.pageSize.getHeight();
  // Never strand a heading at the foot of a page with its table overleaf.
  if (y > pageH - 45) {
    doc.addPage();
    y = MARGIN;
  }

  doc.setFillColor(...ACCENT_DEEP);
  doc.rect(MARGIN, y, contentW, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...WHITE);
  doc.text(winAnsi(sheet.title.toUpperCase()), MARGIN + 3, y + 4.8);
  y += 7;

  if (sheet.note) {
    doc.setFillColor(252, 253, 252);
    doc.setDrawColor(...RULE);
    const lines = doc.splitTextToSize(winAnsi(sheet.note), contentW - 6) as string[];
    const h = lines.length * 3 + 3;
    doc.rect(MARGIN, y, contentW, h, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...INK_SOFT);
    doc.text(lines, MARGIN + 3, y + 3.5);
    y += h;
  }
  return y;
}

/**
 * The chart a sheet declares, drawn as vector rectangles.
 *
 * No chart library: a filled rectangle is the whole requirement, and this
 * repository already refuses charting dependencies on the grounds that a
 * styling API in one language has no twin in the other.
 */
function drawChart(
  doc: Doc, sheet: ReportSheet, yIn: number, contentW: number, currency: string,
): number {
  const chart = sheet.chart;
  if (!chart) return yIn;

  let y = yIn;
  const colourOf = (name: string): RGB =>
    name === 'income' ? INCOME : name === 'expense' ? EXPENSE : ACCENT;

  if (chart.kind === 'bar') {
    const rows = sheet.rows.slice(0, 8);
    const max = Math.max(...rows.map((r) => num(r[chart.series[0].key])), 0);
    if (max <= 0) return y;

    const h = rows.length * 5 + 6;
    doc.setFillColor(...WHITE);
    doc.setDrawColor(...RULE);
    doc.rect(MARGIN, y, contentW, h, 'FD');

    const labelW = 42;
    const valueW = 30;
    const trackX = MARGIN + labelW + 3;
    const trackW = contentW - labelW - valueW - 9;

    rows.forEach((r, i) => {
      const by = y + 4 + i * 5;
      const v = num(r[chart.series[0].key]);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...INK_SOFT);
      doc.text(winAnsi(String(r[chart.labelKey] ?? '')), MARGIN + labelW, by + 2.4, {
        align: 'right', maxWidth: labelW - 2,
      });
      doc.setFillColor(238, 241, 238);
      doc.rect(trackX, by, trackW, 3.4, 'F');
      doc.setFillColor(...colourOf(chart.series[0].color));
      doc.rect(trackX, by, Math.max((v / max) * trackW, 0.4), 3.4, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(...INK);
      doc.text(fmt(v, 'money', currency), MARGIN + contentW - 3, by + 2.4, { align: 'right' });
    });
    return y + h + 3;
  }

  // Grouped columns.
  const max = Math.max(
    ...sheet.rows.flatMap((r) => chart.series.map((s) => num(r[s.key]))), 0,
  );
  if (max <= 0) return y;

  const plotH = 24;
  // plot + legend + label row + caption row, each with its own band so the
  // caption cannot land on top of the month labels.
  const boxH = plotH + 18;
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...RULE);
  doc.rect(MARGIN, y, contentW, boxH, 'FD');

  // Legend.
  let lx = MARGIN + 3;
  chart.series.forEach((s) => {
    doc.setFillColor(...colourOf(s.color));
    doc.rect(lx, y + 2.4, 2.2, 2.2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.6);
    doc.setTextColor(...INK_SOFT);
    doc.text(winAnsi(s.label), lx + 3.2, y + 4.3);
    lx += 3.2 + doc.getTextWidth(s.label) + 6;
  });

  const base = y + 6 + plotH;
  const slot = contentW / Math.max(sheet.rows.length, 1);
  const barW = Math.min(4, slot / (chart.series.length + 2));

  sheet.rows.forEach((r, i) => {
    const centre = MARGIN + slot * i + slot / 2;
    const groupW = barW * chart.series.length + 1;
    chart.series.forEach((s, si) => {
      const v = num(r[s.key]);
      // A floor so a small-but-real value is a visible mark rather than an
      // empty slot indistinguishable from zero.
      const bh = v > 0 ? Math.max((v / max) * plotH, 0.5) : 0;
      doc.setFillColor(...colourOf(s.color));
      doc.rect(centre - groupW / 2 + si * (barW + 1), base - bh, barW, bh, 'F');
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.4);
    doc.setTextColor(...INK_SOFT);
    doc.text(winAnsi(String(r[chart.labelKey] ?? '').split('·')[0].trim()), centre, base + 4, {
      align: 'center', maxWidth: slot - 2,
    });
  });

  doc.setDrawColor(...RULE);
  doc.line(MARGIN + 2, base, MARGIN + contentW - 2, base);
  doc.setFontSize(5.2);
  doc.setTextColor(...MUTED);
  doc.text(`Tallest bar = ${fmt(max, 'money', currency)}`, MARGIN + 3, y + boxH - 2);

  return y + boxH + 3;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

/** Generates the PDF and saves it, reporting what actually happened. */
export async function downloadPdf(report: ReportWorkbook): Promise<SaveOutcome> {
  return saveFile({
    filename: reportFilename(report, 'pdf'),
    data: await buildPdf(report),
    mimeType: 'application/pdf',
    filter: { name: 'PDF document', extensions: ['pdf'] },
  });
}
