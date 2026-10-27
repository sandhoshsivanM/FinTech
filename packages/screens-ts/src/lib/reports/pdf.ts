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
 * ── Look ───────────────────────────────────────────────────────────────────
 * The app's "Zentra" language, set for paper: a white page, near-black ink,
 * grey trays instead of boxes, and colour reserved for meaning — blue for
 * neutral data, green for money in, pink for money out, amber for warnings.
 * Header bands are the app's black pill. Labels are sentence case; the
 * letter-spaced wordmark beside the logo is the one place tracking is allowed.
 *
 * The face is Anek Latin, the app's own, embedded so the document matches the
 * screen and can print a real ₹ — the PDF standard fonts are WinAnsi and have
 * no rupee sign. The TTFs are fetched only when exporting (see `assets.ts`);
 * if that fails the document still renders, in Helvetica with the old
 * character mapping.
 *
 * Nothing leaves the device: the bytes are generated here and handed to
 * `saveFile`.
 */
import type { jsPDF as JsPDF } from 'jspdf';
import { saveFile, type SaveOutcome } from '../saveFile';
import { formatReportDate, type CellValue, type ReportSheet, type ReportWorkbook } from '@khazana/screens/lib/reports/model';
import { reportFilename } from '@khazana/screens/lib/reports/xlsx';
import { loadReportAssets, type ReportAssets } from '@khazana/screens/lib/reports/assets';

/* -------------------------------------------------------------------------- */
/* Palette — Zentra tokens as RGB triples                                     */
/* -------------------------------------------------------------------------- */

type RGB = [number, number, number];

const INK: RGB = [17, 18, 20]; //        #111214 — text, black pill
const INK_SOFT: RGB = [92, 92, 97]; //   #5C5C61 — small text that must print
const MUTED: RGB = [110, 110, 115]; //   #6E6E73 — tertiary small text (≥4.5:1 on white and tray; #8E8E93 was 3.3:1)
const LINE: RGB = [230, 230, 232]; //    #E6E6E8 — rules
const TRAY: RGB = [242, 242, 242]; //    #F2F2F2 — zebra, bar tracks
const CARD: RGB = [248, 248, 248]; //    #F8F8F8 — tiles, chart cards
const WHITE: RGB = [255, 255, 255];
const BLUE: RGB = [28, 111, 251]; //     #1C6FFB — neutral data
const GREEN: RGB = [11, 167, 34]; //     #0BA722 — income, gains
const PINK: RGB = [243, 54, 136]; //     #F33688 — expense, losses
const AMBER: RGB = [227, 154, 22]; //    #E39A16 — warnings
const AMBER_SOFT: RGB = [252, 245, 232];

const MARGIN = 14;

const isNumeric = (f: string) =>
  f === 'money' || f === 'number' || f === 'integer' || f === 'percent';

/**
 * Maps characters the PDF's standard fonts cannot encode — used only when the
 * embedded face failed to load and the document falls back to Helvetica.
 *
 * jsPDF's built-in Helvetica uses WinAnsi, which has no U+2212 MINUS SIGN — the
 * ledger's labels use it ("Assets − liabilities") and it rendered as a stray
 * quote mark. En and em dashes ARE in WinAnsi and are left alone.
 */
export const winAnsi = (v: string): string => v
  .replace(/−/g, '-')
  .replace(/ /g, ' ')
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"');

/**
 * The same job for Anek Latin, which covers ₹, the minus sign, curly quotes
 * and dashes; only the no-break space is normalised, because jsPDF measures
 * it inconsistently when wrapping.
 */
const anekSafe = (v: string): string => v.replace(/ /g, ' ');

/* -------------------------------------------------------------------------- */
/* Type — the faces in use, with a Helvetica fallback                          */
/* -------------------------------------------------------------------------- */

interface Face { family: string; style: 'normal' | 'bold' }
interface Type {
  light: Face;
  regular: Face;
  medium: Face;
  /** Whether the embedded face is in use (so ₹ and U+2212 can be printed). */
  embedded: boolean;
  clean: (v: string) => string;
}

function registerFonts(doc: JsPDF, fonts: ReportAssets['fonts']): Type {
  if (fonts) {
    try {
      const add = (file: string, data: string, family: string) => {
        doc.addFileToVFS(file, data);
        doc.addFont(file, family, 'normal');
      };
      add('AnekLatin-Light.ttf', fonts.light, 'AnekLight');
      add('AnekLatin-Regular.ttf', fonts.regular, 'Anek');
      add('AnekLatin-Medium.ttf', fonts.medium, 'AnekMedium');
      return {
        light: { family: 'AnekLight', style: 'normal' },
        regular: { family: 'Anek', style: 'normal' },
        medium: { family: 'AnekMedium', style: 'normal' },
        embedded: true,
        clean: anekSafe,
      };
    } catch {
      /* fall through to the standard font */
    }
  }
  return {
    light: { family: 'helvetica', style: 'normal' },
    regular: { family: 'helvetica', style: 'normal' },
    medium: { family: 'helvetica', style: 'bold' },
    embedded: false,
    clean: winAnsi,
  };
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/** Cell text. Mirrors the spreadsheet's formats so the two agree on screen. */
function makeFmt(t: Type, currency: string) {
  // The rupee sign where the face can draw it; the ISO code otherwise, which
  // is also what every other currency keeps.
  const symbol = t.embedded && currency === 'INR' ? '₹' : `${currency} `;
  const minus = t.embedded ? '−' : '-';
  return (v: CellValue, format: string): string => {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date) return formatReportDate(v);
    if (typeof v === 'number') {
      if (format === 'integer') return v.toLocaleString();
      if (format === 'percent') {
        return `${v < 0 ? minus : ''}${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
      }
      const n = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const sign = v < 0 ? minus : '';
      return format === 'money' ? `${sign}${symbol}${n}` : `${sign}${n}`;
    }
    return t.clean(String(v));
  };
}

const num = (v: CellValue): number => (typeof v === 'number' ? v : 0);

/**
 * The data colour a figure earns. Income is green and expense pink wherever
 * they appear; signed results (net, gain) take the colour of their sign; any
 * other negative amount is pink. Everything else stays ink.
 */
function toneOf(key: string, v: CellValue): RGB | null {
  if (typeof v !== 'number' || v === 0) return null;
  if (key === 'income') return GREEN;
  if (key === 'expense') return PINK;
  if (key === 'net' || key === 'gain' || key === 'gainPct') return v > 0 ? GREEN : PINK;
  return v < 0 ? PINK : null;
}

/* -------------------------------------------------------------------------- */
/* Build                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Generates the PDF and returns its bytes. `assets` is for callers that have
 * the font and logo bytes already (tests, scripts); the app lets it fetch them.
 */
export async function buildPdf(report: ReportWorkbook, assets?: ReportAssets): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const { logoPng, fonts } = assets ?? await loadReportAssets();

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const t = registerFonts(doc, fonts);
  const { meta } = report;
  const fmt = makeFmt(t, meta.currencyCode);
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - MARGIN * 2;

  const pen = (face: Face, size: number, color: RGB) => {
    doc.setFont(face.family, face.style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  doc.setProperties({
    title: `${meta.appName} financial report — ${meta.periodLabel}`,
    subject: `Financial report for ${meta.profileName}, ${formatReportDate(meta.periodStart)} to ${formatReportDate(meta.periodEnd)}`,
    author: meta.appName,
    creator: `${meta.appName} ${meta.appVersion}`,
    keywords: 'financial report, statement, ledger',
  });
  doc.setLanguage('en-GB');
  // Opens on the title in viewers that honour it, rather than the file name.
  doc.viewerPreferences({ DisplayDocTitle: true });

  /* ---- Masthead --------------------------------------------------------- */
  // Logo and letter-spaced wordmark on the left, the generation date opposite.
  let y = 12;
  const markSize = 9;
  let wordX = MARGIN;
  if (logoPng) {
    try {
      doc.addImage(logoPng, 'PNG', MARGIN, y, markSize, markSize, 'khazana-mark', 'FAST');
      wordX = MARGIN + markSize + 3;
    } catch {
      /* a broken image is not worth failing the export over */
    }
  }
  pen(t.medium, 9.5, INK);
  doc.text(meta.appName.toUpperCase(), wordX, y + markSize / 2 + 1.3, { charSpace: 1.4 });
  pen(t.regular, 7.5, INK_SOFT);
  doc.text(`Generated ${formatReportDate(meta.generatedAt)}`, MARGIN + contentW, y + markSize / 2 + 1.3, {
    align: 'right',
  });

  y += markSize + 13;
  pen(t.light, 26, INK);
  doc.text('Financial report', MARGIN, y);
  y += 7;
  pen(t.regular, 11, INK_SOFT);
  doc.text(t.clean(meta.periodLabel), MARGIN, y);
  y += 6;

  /* ---- Meta tray -------------------------------------------------------- */
  const metaCells: [string, string][] = [
    ['Profile', meta.profileName],
    ['Currency', meta.currencyCode],
    ['Period', `${formatReportDate(meta.periodStart)} – ${formatReportDate(meta.periodEnd)}`],
    ['Generated', formatReportDate(meta.generatedAt)],
    ['Version', meta.appVersion],
  ];
  // Period is the long one; give it the room.
  const weights = [1, 0.8, 1.6, 1, 0.8];
  const unit = contentW / weights.reduce((a, b) => a + b, 0);
  doc.setFillColor(...CARD);
  doc.roundedRect(MARGIN, y, contentW, 15, 2.5, 2.5, 'F');
  let mx = MARGIN;
  metaCells.forEach(([label, value], i) => {
    const w = weights[i] * unit;
    pen(t.regular, 7, INK_SOFT);
    doc.text(label, mx + 4, y + 5.6);
    pen(t.medium, 9, INK);
    doc.text(t.clean(value), mx + 4, y + 10.8, { maxWidth: w - 6 });
    mx += w;
  });
  y += 21;

  /* ---- Unbalanced-ledger warning ---------------------------------------- */
  if (!meta.ledgerBalanced) {
    doc.setFillColor(...AMBER_SOFT);
    doc.roundedRect(MARGIN, y, contentW, 13, 2.5, 2.5, 'F');
    doc.setFillColor(...AMBER);
    doc.circle(MARGIN + 5, y + 4.6, 1.3, 'F');
    pen(t.medium, 9, INK);
    doc.text('The books do not balance.', MARGIN + 8.5, y + 5.4);
    pen(t.regular, 7.5, INK_SOFT);
    doc.text(
      `Discrepancy ${fmt(meta.discrepancy, 'money')} — an entry whose postings do not sum to zero, or a posting against an account not in the chart.`,
      MARGIN + 8.5, y + 9.8, { maxWidth: contentW - 12 },
    );
    y += 18;
  }

  /* ---- KPI tiles -------------------------------------------------------- */
  for (const group of report.summary) {
    pen(t.medium, 10.5, INK);
    doc.text(t.clean(group.heading), MARGIN, y + 3);
    y += 6;

    // A fixed five-column grid: with a flowing layout a group of five tiles
    // stretches the last one across the full width, which reads as a mistake.
    const cols = 5;
    const gap = 2.5;
    const tileW = (contentW - gap * (cols - 1)) / cols;
    const tileH = 21;
    const first = group === report.summary[0];

    group.stats.forEach((s, i) => {
      const col = i % cols;
      const rowN = Math.floor(i / cols);
      const x = MARGIN + col * (tileW + gap);
      const ty = y + rowN * (tileH + gap);

      doc.setFillColor(...CARD);
      doc.roundedRect(x, ty, tileW, tileH, 2.5, 2.5, 'F');

      pen(t.regular, 7, INK_SOFT);
      doc.text(t.clean(s.label), x + 3.5, ty + 5.8, { maxWidth: tileW - 7 });

      // Income and expenses lead the report, so they carry their colours;
      // after that a figure is coloured only when it is negative.
      const negative = typeof s.value === 'number' && s.value < 0;
      const tone: RGB = negative ? PINK : first && i === 0 ? GREEN : first && i === 1 ? PINK : INK;
      const text = fmt(s.value, s.format);
      // Big figures in the light face, shrunk only as far as the tile needs.
      let size = 14;
      pen(t.light, size, tone);
      while (size > 8 && doc.getTextWidth(text) > tileW - 7) {
        size -= 0.5;
        doc.setFontSize(size);
      }
      doc.text(text, x + 3.5, ty + 13.2);

      if (s.hint) {
        pen(t.regular, 6, INK_SOFT);
        doc.text(t.clean(s.hint), x + 3.5, ty + 17.8, { maxWidth: tileW - 7 });
      }
    });

    y += Math.ceil(group.stats.length / cols) * (tileH + gap) + 5;
  }

  /* ---- Sections --------------------------------------------------------- */
  for (const sheet of report.sheets) {
    y = drawSectionHeader(doc, t, sheet, y + 2, contentW);
    y = drawChart(doc, t, sheet, y, contentW, fmt);

    const wide = sheet.columns.length >= 8;
    const pad = wide ? { top: 1.3, bottom: 1.3, left: 1.2, right: 1.2 } : { top: 1.8, bottom: 1.8, left: 2.2, right: 2.2 };
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: 16 },
      head: [sheet.columns.map((c) => t.clean(c.header))],
      body: sheet.rows.map((r) => sheet.columns.map((c) => fmt(r[c.key] ?? null, c.format))),
      foot: sheet.totals
        ? [sheet.columns.map((c) => fmt(sheet.totals![c.key] ?? null, c.format))]
        : undefined,
      showFoot: 'lastPage',
      theme: 'plain',
      styles: {
        font: t.regular.family,
        fontStyle: t.regular.style,
        fontSize: wide ? 6 : 7.5,
        cellPadding: pad,
        lineColor: LINE,
        lineWidth: 0,
        textColor: INK,
        overflow: 'linebreak',
        valign: 'middle',
      },
      // The black pill, squared off to sit flush with the rows under it.
      headStyles: {
        fillColor: INK,
        textColor: WHITE,
        font: t.medium.family,
        fontStyle: t.medium.style,
        fontSize: wide ? 5.8 : 7,
      },
      footStyles: {
        fillColor: WHITE,
        textColor: INK,
        font: t.medium.family,
        fontStyle: t.medium.style,
        fontSize: wide ? 6 : 7.5,
        lineColor: INK,
        lineWidth: { top: 0.35 },
      },
      alternateRowStyles: { fillColor: TRAY },
      columnStyles: Object.fromEntries(
        sheet.columns.map((c, i) => [i, { halign: isNumeric(c.format) ? 'right' : 'left' }]),
      ),
      didParseCell: (data) => {
        const col = sheet.columns[data.column.index];
        if (!col) return;
        // columnStyles reach only the body; the header and totals must line
        // up with the figures under them.
        if (isNumeric(col.format)) data.cell.styles.halign = 'right';
        if (data.section === 'body' || data.section === 'foot') {
          const src = data.section === 'body' ? sheet.rows[data.row.index] : sheet.totals;
          const tone = isNumeric(col.format) ? toneOf(col.key, src?.[col.key] ?? null) : null;
          if (tone) data.cell.styles.textColor = tone;
        }
      },
    });

    // @ts-expect-error — autoTable stores its cursor on the document.
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  }

  /* ---- Footer on every page --------------------------------------------- */
  const pages = doc.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, pageH - 11, MARGIN + contentW, pageH - 11);
    pen(t.regular, 7, INK_SOFT);
    doc.text(t.clean(`${meta.appName} · ${meta.periodLabel}`), MARGIN, pageH - 7);
    doc.text(`Page ${p} of ${pages}`, MARGIN + contentW, pageH - 7, { align: 'right' });
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

/* -------------------------------------------------------------------------- */
/* Section furniture                                                          */
/* -------------------------------------------------------------------------- */

type Fmt = ReturnType<typeof makeFmt>;

/** The section title in ink, and its note under it. */
function drawSectionHeader(doc: JsPDF, t: Type, sheet: ReportSheet, yIn: number, contentW: number): number {
  let y = yIn;
  const pageH = doc.internal.pageSize.getHeight();
  // Never strand a heading at the foot of a page with its table overleaf.
  if (y > pageH - 50) {
    doc.addPage();
    y = MARGIN + 2;
  }

  doc.setFont(t.medium.family, t.medium.style);
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(t.clean(sheet.title), MARGIN, y + 4);
  y += 7;

  if (sheet.note) {
    doc.setFont(t.regular.family, t.regular.style);
    doc.setFontSize(7.5);
    doc.setTextColor(...INK_SOFT);
    const lines = doc.splitTextToSize(t.clean(sheet.note), contentW) as string[];
    doc.text(lines, MARGIN, y + 2);
    y += lines.length * 3.3 + 1.5;
  }
  return y + 2;
}

/**
 * The chart a sheet declares, drawn as vector shapes.
 *
 * No chart library: a filled rectangle is the whole requirement, and this
 * repository already refuses charting dependencies on the grounds that a
 * styling API in one language has no twin in the other.
 */
function drawChart(
  doc: JsPDF, t: Type, sheet: ReportSheet, yIn: number, contentW: number, fmt: Fmt,
): number {
  const chart = sheet.chart;
  if (!chart) return yIn;

  const y = yIn;
  const colourOf = (name: string): RGB =>
    name === 'income' ? GREEN : name === 'expense' ? PINK : BLUE;
  const pen = (face: Face, size: number, color: RGB) => {
    doc.setFont(face.family, face.style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  if (chart.kind === 'bar') {
    const rows = sheet.rows.slice(0, 8);
    const max = Math.max(...rows.map((r) => num(r[chart.series[0].key])), 0);
    if (max <= 0) return y;

    const step = 6;
    const h = rows.length * step + 7;
    doc.setFillColor(...CARD);
    doc.roundedRect(MARGIN, y, contentW, h, 2.5, 2.5, 'F');

    const labelW = 44;
    const valueW = 30;
    const trackX = MARGIN + labelW + 4;
    const trackW = contentW - labelW - valueW - 10;
    const barH = 3;

    rows.forEach((r, i) => {
      const by = y + 4.5 + i * step;
      const v = num(r[chart.series[0].key]);
      pen(t.regular, 7, INK_SOFT);
      doc.text(t.clean(String(r[chart.labelKey] ?? '')), MARGIN + labelW, by + 2.3, {
        align: 'right', maxWidth: labelW - 4,
      });
      doc.setFillColor(...WHITE);
      doc.roundedRect(trackX, by, trackW, barH, barH / 2, barH / 2, 'F');
      doc.setFillColor(...colourOf(chart.series[0].color));
      const bw = Math.max((v / max) * trackW, barH);
      doc.roundedRect(trackX, by, bw, barH, barH / 2, barH / 2, 'F');
      pen(t.medium, 7, INK);
      doc.text(fmt(v, 'money'), MARGIN + contentW - 4, by + 2.3, { align: 'right' });
    });
    return y + h + 4;
  }

  // Grouped columns.
  const max = Math.max(
    ...sheet.rows.flatMap((r) => chart.series.map((s) => num(r[s.key]))), 0,
  );
  if (max <= 0) return y;

  const plotH = 26;
  // legend + plot + label row + caption row, each with its own band so the
  // caption cannot land on top of the month labels.
  const boxH = plotH + 21;
  doc.setFillColor(...CARD);
  doc.roundedRect(MARGIN, y, contentW, boxH, 2.5, 2.5, 'F');

  // Legend.
  let lx = MARGIN + 4;
  chart.series.forEach((s) => {
    doc.setFillColor(...colourOf(s.color));
    doc.circle(lx + 1.1, y + 4.6, 1.1, 'F');
    pen(t.regular, 7, INK_SOFT);
    const label = t.clean(s.label);
    doc.text(label, lx + 3.4, y + 5.6);
    lx += 3.4 + doc.getTextWidth(label) + 6;
  });

  const base = y + 9 + plotH;
  const inner = contentW - 8;
  const slot = inner / Math.max(sheet.rows.length, 1);
  const barW = Math.min(4.5, slot / (chart.series.length + 2));

  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.25);
  doc.line(MARGIN + 4, base, MARGIN + contentW - 4, base);

  sheet.rows.forEach((r, i) => {
    const centre = MARGIN + 4 + slot * i + slot / 2;
    const groupW = barW * chart.series.length + 1;
    chart.series.forEach((s, si) => {
      const v = num(r[s.key]);
      // A floor so a small-but-real value is a visible mark rather than an
      // empty slot indistinguishable from zero.
      const bh = v > 0 ? Math.max((v / max) * plotH, 0.6) : 0;
      if (bh <= 0) return;
      doc.setFillColor(...colourOf(s.color));
      const rr = Math.min(barW / 2, bh / 2, 1);
      doc.roundedRect(centre - groupW / 2 + si * (barW + 1), base - bh, barW, bh, rr, rr, 'F');
    });
    pen(t.regular, 6.2, INK_SOFT);
    doc.text(t.clean(String(r[chart.labelKey] ?? '').split('·')[0].trim()), centre, base + 4, {
      align: 'center', maxWidth: slot - 1,
    });
  });

  pen(t.regular, 6.2, MUTED);
  doc.text(`Tallest bar = ${fmt(max, 'money')}`, MARGIN + 4, y + boxH - 3);

  return y + boxH + 4;
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
