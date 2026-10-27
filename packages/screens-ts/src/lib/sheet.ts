/**
 * One file → one grid of cells, whatever the bank or broker exported.
 *
 * Every importer downstream works on `string[][]`, so none of them has to know
 * whether the user handed us a comma CSV, HDFC's tab-delimited .txt, or an
 * .xlsx straight out of Console. Getting that normalisation wrong is silent
 * data loss, so the rules here are deliberate:
 *
 *  - Delimiter is sniffed, not assumed. Indian bank exports ship as comma, tab,
 *    semicolon or pipe, and a semicolon file read as comma yields one giant
 *    column that "parses" to zero usable rows.
 *  - XLSX is loaded lazily. SheetJS is ~400 KB; nobody importing a CSV should
 *    pay for it, and the app must still boot offline when it is never touched.
 *  - Cells arrive as strings. Excel serial dates are the one exception we
 *    convert eagerly (see `readWorkbook`) because a raw 45678 is unrecoverable
 *    once it reaches a date parser.
 */

/** Extensions the file picker accepts. */
export const ACCEPTED_EXTENSIONS = '.csv,.txt,.tsv,.xls,.xlsx';

/** Bank statements can be long; this is a guard against a 200 MB mis-drop. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export interface SheetResult {
  rows: string[][];
  /** Sheet name for spreadsheets; the filename otherwise. Shown in the preview. */
  source: string;
  error?: string;
}

const DELIMITERS = [',', '\t', ';', '|'] as const;

/**
 * Picks the delimiter that yields the most consistent column count.
 *
 * Counting occurrences alone is wrong: a narration column full of commas
 * ("PAYMENT TO X, LTD") beats a real tab delimiter on raw count. Consistency
 * across lines is what actually identifies the separator.
 */
export function sniffDelimiter(sample: string): string {
  const lines = sample.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  if (!lines.length) return ',';

  let best = ',';
  let bestScore = -1;
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => splitLine(l, d).length);
    const max = Math.max(...counts);
    if (max < 2) continue; // never split anything — not a delimiter
    // Reward many columns, punish rows that disagree about how many there are.
    const disagreement = counts.filter((c) => c !== max).length / counts.length;
    const score = max * (1 - disagreement);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/** Splits one delimited line, honouring double-quoted fields. */
export function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === delim && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.replace(/^["']|["']$/g, '').trim());
}

/** Parses delimited text into a grid. Blank lines are dropped. */
export function parseDelimited(text: string, delim?: string): string[][] {
  const clean = text.replace(/^﻿/, ''); // Excel's UTF-8 BOM
  const d = delim ?? sniffDelimiter(clean);
  return clean
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => splitLine(l, d));
}

/**
 * Reads a spreadsheet. SheetJS is imported here and nowhere else, so the
 * bundler can keep it in its own lazily-fetched chunk.
 */
async function readWorkbook(buf: ArrayBuffer): Promise<SheetResult> {
  const XLSX = await import('xlsx');
  // cellDates makes SheetJS hand back Date objects instead of serial numbers,
  // which is the difference between a readable date and the integer 45678.
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: false });
  const name = wb.SheetNames[0];
  if (!name) return { rows: [], source: '', error: 'The workbook has no sheets.' };

  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false,
  });

  return {
    source: name,
    rows: rows.map((r) =>
      (r ?? []).map((c) => {
        if (c instanceof Date) return c.toISOString().slice(0, 10);
        return String(c ?? '').trim();
      }),
    ),
  };
}

/** True when the name looks like a spreadsheet rather than delimited text. */
export function isSpreadsheet(filename: string): boolean {
  return /\.(xlsx|xls|xlsm|xlsb|ods)$/i.test(filename);
}

/**
 * Reads any accepted file into a grid of trimmed cells.
 *
 * Never throws: a corrupt or password-protected workbook comes back as an
 * `error` string the UI can show, because an import screen that dies on a bad
 * file leaves the user with nothing to act on.
 */
export async function readSheet(file: File): Promise<SheetResult> {
  if (file.size > MAX_FILE_BYTES) {
    return {
      rows: [],
      source: file.name,
      error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB — split the date range into smaller exports.`,
    };
  }

  try {
    if (isSpreadsheet(file.name)) {
      const res = await readWorkbook(await file.arrayBuffer());
      return { ...res, source: res.source || file.name };
    }
    return { rows: parseDelimited(await file.text()), source: file.name };
  } catch (e) {
    return {
      rows: [],
      source: file.name,
      error: `Could not read that file: ${e instanceof Error ? e.message : String(e)}. If it is password-protected, remove the password and export again.`,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Header location + column matching                                          */
/* -------------------------------------------------------------------------- */

/**
 * Finds the real header row.
 *
 * Bank statements almost never start with headers — HDFC and SBI prepend the
 * account number, holder name, address and a blank line or five. Scanning for
 * the first row that matches enough known column names is what lets those
 * files import without the user hand-editing them first.
 *
 * Returns -1 when nothing matches, so the caller can say which columns it
 * wanted instead of parsing garbage.
 */
export function findHeaderRow(rows: string[][], required: string[][], limit = 25): number {
  let bestRow = -1;
  let bestHits = 0;
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    const hits = required.filter((aliases) => headerIndex(rows[i], aliases) !== -1).length;
    if (hits > bestHits) { bestHits = hits; bestRow = i; }
    if (hits === required.length) return i; // perfect match, stop looking
  }
  // A partial match still beats nothing: the caller reports which columns are
  // missing, which is far more useful than "could not read the file".
  return bestHits > 0 ? bestRow : -1;
}

/** Index of the first column whose name contains any of `patterns`. */
export function headerIndex(headers: string[], patterns: string[]): number {
  const norm = headers.map((h) => h.toLowerCase().replace(/[._]/g, ' ').trim());
  // Exact first — 'amount' must not lose to 'amount in foreign currency'.
  for (const p of patterns) {
    const i = norm.findIndex((h) => h === p);
    if (i !== -1) return i;
  }
  for (const p of patterns) {
    const i = norm.findIndex((h) => h.includes(p));
    if (i !== -1) return i;
  }
  return -1;
}

/** Strips currency symbols, thousands separators and stray whitespace. */
export function num(raw: string | undefined): number {
  if (raw == null) return NaN;
  let s = String(raw).replace(/[₹$€£,\s]/g, '').replace(/[A-Za-z]/g, '');
  if (!s) return NaN;
  // Accounting negatives: (1,234.00) means −1234.00
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); } // trailing-sign exports
  const n = parseFloat(s);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}
