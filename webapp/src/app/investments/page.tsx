'use client';
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import clsx from 'clsx';
import type Decimal from 'decimal.js';
import {
  TrendingUp, Plus, Trash2, Upload, ChevronDown, ChevronUp, CheckCircle2, Pencil,
} from 'lucide-react';
import { useApp, uid } from '@/lib/store';
import { D, ZERO } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import {
  portfolioSummary, holdingView, ASSET_META, xirr,
  rollup, sunburst, groupShades, ASSET_GROUP_META, UNCLASSIFIED_KEY,
  type RollupDimension, type RollupRow, type AssetGroup,
} from '@/domain/portfolio';
import { useDarkMode } from '@/lib/useDarkMode';
import {
  loadInstrumentMaster, lookupClassification,
  EMPTY_MASTER, type InstrumentMaster,
} from '@/domain/instrumentMaster';
import { computeGain } from '@/domain/tax';
import { STORE, type AssetType, type Holding } from '@/lib/types';
import {
  GlassCard,
  PageIntro,
  SectionHeader,
  StatStrip,
  EmptyState,
  Button,
  Field,
  Input,
  Select,
  Sunburst,
  type SunburstNode,
} from '@/components/ui';
import { useConfirm } from '@/components/Confirm';

const ASSET_TYPES = Object.entries(ASSET_META) as [AssetType, { label: string; color: string }][];

// ── helpers ──────────────────────────────────────────────────────────────────

function mask(s: string, ghost: boolean) {
  return ghost ? '••••••' : s;
}

function pnlColor(v: number) {
  return v >= 0 ? 'var(--income)' : 'var(--expense)';
}

// Compact value for the donut centre so it never overflows the ring (Indian
// Cr/L/K scale). `n` is already in the display currency.
function compact(n: number, symbol: string) {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${symbol}${(n / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${symbol}${(n / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `${symbol}${(n / 1e3).toFixed(1)}K`;
  return `${symbol}${Math.round(n)}`;
}

function epochToDateInput(ms: number | null | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateInputToEpoch(s: string): number | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

// ── CSV import helpers ────────────────────────────────────────────────────────

interface CsvRow {
  symbol: string;
  exchange: string;
  quantity: string;
  avgCost: string;
  lastPrice: string;
  assetType: AssetType;
}

function headerIndex(headers: string[], patterns: string[]): number {
  for (const p of patterns) {
    const idx = headers.findIndex((h) => h.toLowerCase().includes(p));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseCsv(text: string): { rows: CsvRow[]; skipped: number } {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { rows: [], skipped: 0 };

  const headers = lines[0].split(',').map((h) => h.trim().replace(/["']/g, ''));
  const iSym = headerIndex(headers, ['tradingsymbol', 'symbol', 'scrip', 'instrument']);
  const iQty = headerIndex(headers, ['qty', 'quantity']);
  const iAvg = headerIndex(headers, ['avg cost', 'avg price', 'avg', 'average cost', 'average', 'buy avg', 'buy price', 'purchase price']);
  const iLtp = headerIndex(headers, ['ltp', 'last price', 'last', 'current price', 'market price', 'price']);
  const iExch = headerIndex(headers, ['exchange', 'exch', 'market']);

  if (iSym === -1 || iQty === -1 || iAvg === -1) return { rows: [], skipped: lines.length - 1 };

  const rows: CsvRow[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/["']/g, ''));
    const symbol = cols[iSym] ?? '';
    const rawQty = cols[iQty] ?? '';
    const rawAvg = cols[iAvg] ?? '';

    if (!symbol || isNaN(parseFloat(rawQty)) || isNaN(parseFloat(rawAvg))) {
      skipped++;
      continue;
    }

    const rawLtp = iLtp !== -1 ? (cols[iLtp] ?? '') : '';
    const lastPrice = rawLtp && !isNaN(parseFloat(rawLtp)) ? parseFloat(rawLtp).toString() : '';

    let exchange = 'NSE';
    if (iExch !== -1) {
      const e = (cols[iExch] ?? '').toUpperCase();
      if (e === 'BSE') exchange = 'BSE';
    }

    rows.push({
      symbol: symbol.toUpperCase(),
      exchange,
      quantity: parseFloat(rawQty).toString(),
      avgCost: parseFloat(rawAvg).toString(),
      lastPrice,
      assetType: 'equity_etf',
    });
  }

  return { rows, skipped };
}

// ── Add / Edit Holding Form ───────────────────────────────────────────────────

interface HoldingFormState {
  symbol: string;
  exchange: string;
  quantity: string;
  avgCost: string;
  lastPrice: string;
  assetType: AssetType;
  firstPurchaseDate: string; // 'YYYY-MM-DD' for <input type=date>
}

const defaultForm: HoldingFormState = {
  symbol: '', exchange: 'NSE', quantity: '', avgCost: '', lastPrice: '',
  assetType: 'equity_etf', firstPurchaseDate: '',
};

function holdingToForm(h: Holding): HoldingFormState {
  return {
    symbol: h.symbol,
    exchange: h.exchange,
    quantity: h.quantity,
    avgCost: h.avgCost,
    lastPrice: h.lastPrice ?? '',
    assetType: h.assetType,
    firstPurchaseDate: epochToDateInput(h.firstPurchaseDate),
  };
}

function HoldingForm({
  initial,
  editId,
  onClose,
}: {
  initial?: HoldingFormState;
  editId?: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState<HoldingFormState>(initial ?? defaultForm);
  const [saving, setSaving] = useState(false);
  const put = useApp((s) => s.put);
  const vaultId = useApp((s) => s.vaultId);

  const set = (k: keyof HoldingFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const valid =
    form.symbol.trim() !== '' && parseFloat(form.quantity) > 0 && parseFloat(form.avgCost) > 0;

  async function save() {
    if (!valid) return;
    setSaving(true);
    const holding: Holding = {
      id: editId ?? uid(),
      vaultId,
      symbol: form.symbol.trim().toUpperCase(),
      exchange: form.exchange,
      quantity: D(form.quantity).toString(),
      avgCost: D(form.avgCost).toString(),
      lastPrice: form.lastPrice ? D(form.lastPrice).toString() : null,
      assetType: form.assetType,
      firstPurchaseDate: dateInputToEpoch(form.firstPurchaseDate),
    };
    await put(STORE.holding, holding as unknown as { id: string } & Record<string, unknown>);
    setSaving(false);
    onClose();
  }

  const isEdit = !!editId;

  return (
    <GlassCard className="mt-4">
      <SectionHeader title={isEdit ? `Edit Holding — ${form.symbol}` : 'Add Holding'} />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3">
        <Field label="Symbol">
          <Input placeholder="e.g. NIFTYBEES" value={form.symbol} onChange={set('symbol')} />
        </Field>
        <Field label="Exchange">
          <Select value={form.exchange} onChange={set('exchange')}>
            <option value="NSE">NSE</option>
            <option value="BSE">BSE</option>
          </Select>
        </Field>
        <Field label="Asset Type">
          <Select value={form.assetType} onChange={set('assetType')}>
            {ASSET_TYPES.map(([v, m]) => (
              <option key={v} value={v}>{m.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity">
          <Input type="number" min="0" step="0.001" placeholder="100" value={form.quantity} onChange={set('quantity')} />
        </Field>
        <Field label="Avg Cost (INR)">
          <Input type="number" min="0" step="0.01" placeholder="250.00" value={form.avgCost} onChange={set('avgCost')} />
        </Field>
        <Field label="Last Price (INR)" hint="Optional — leave blank to use avg cost">
          <Input type="number" min="0" step="0.01" placeholder="270.00" value={form.lastPrice} onChange={set('lastPrice')} />
        </Field>
        <Field label="First Purchase Date" hint="Optional — used for XIRR and tax type">
          <Input
            type="date"
            value={form.firstPurchaseDate}
            onChange={set('firstPurchaseDate')}
            max={epochToDateInput(Date.now())}
          />
        </Field>
      </div>
      <div className="flex gap-3 mt-5">
        <Button variant="primary" onClick={save} disabled={!valid || saving}>
          {saving ? 'Saving…' : isEdit ? 'Update Holding' : 'Save Holding'}
        </Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </GlassCard>
  );
}

// ── CSV Import Panel ──────────────────────────────────────────────────────────

function ImportPanel({ onClose }: { onClose: () => void }) {
  const fmt = useFmt();
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<CsvRow[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const put = useApp((s) => s.put);
  const vaultId = useApp((s) => s.vaultId);
  const ghost = useApp((s) => s.ghost);

  function parse(text: string) {
    const { rows, skipped: sk } = parseCsv(text);
    setPreview(rows);
    setSkipped(sk);
    setDone(false);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    parse(text);
  }

  async function confirmImport() {
    if (!preview || preview.length === 0) return;
    setImporting(true);
    for (const row of preview) {
      const h: Holding = {
        id: uid(),
        vaultId,
        symbol: row.symbol,
        exchange: row.exchange,
        quantity: row.quantity,
        avgCost: row.avgCost,
        lastPrice: row.lastPrice || null,
        assetType: row.assetType,
      };
      await put(STORE.holding, h as unknown as { id: string } & Record<string, unknown>);
    }
    setImporting(false);
    setDone(true);
    setPreview(null);
    setCsvText('');
  }

  return (
    <GlassCard className="mt-4">
      <SectionHeader title="Import Holdings from CSV" />
      <p className="text-sm text-ink-soft mt-1 mb-4">
        Paste a broker CSV (Zerodha, Upstox, etc.) or upload a file. Columns detected automatically:
        symbol/tradingsymbol, qty/quantity, avg/average, ltp/last. Default asset type: Equity / ETF.
      </p>

      {done && (
        <div className="flex items-center gap-2 text-income mb-4 font-semibold text-sm">
          <CheckCircle2 size={16} />
          Import complete — holdings saved.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {/* File upload */}
        <div className="flex items-center gap-3">
          <Button variant="soft" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Upload .csv file
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          {csvText && <span className="text-sm text-muted">File loaded ({csvText.split('\n').length - 1} data rows)</span>}
        </div>

        {/* Paste area */}
        <Field label="Or paste CSV text">
          <textarea
            rows={6}
            className="w-full rounded-[12px] border border-[var(--line-strong)] bg-[var(--surface)] text-ink px-3.5 py-2.5 text-xs font-mono outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition resize-y"
            placeholder={'Symbol,Qty,Avg Cost,LTP\nNIFTYBEES,100,250.00,271.50\nGOLDBEES,50,48.50,52.00'}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
        </Field>

        <div className="flex gap-3">
          <Button variant="soft" onClick={() => parse(csvText)} disabled={!csvText.trim()}>
            Preview
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>

      {/* Preview list */}
      {preview !== null && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-ink">
              {preview.length} row{preview.length !== 1 ? 's' : ''} parsed
              {skipped > 0 && <span className="ml-2 text-warn text-xs">({skipped} skipped — malformed)</span>}
            </span>
          </div>
          {preview.length === 0 ? (
            <p className="text-sm text-expense">No valid rows found. Check that your CSV has symbol, qty, and avg columns.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-[14px] border border-[var(--glass-border)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted border-b border-[var(--glass-border)]">
                      <th className="px-3 py-2">Symbol</th>
                      <th className="px-3 py-2">Exch</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Avg Cost</th>
                      <th className="px-3 py-2 text-right">Last Price</th>
                      <th className="px-3 py-2">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--glass-border)]">
                    {preview.map((r, i) => (
                      <tr key={i} className="hover:bg-accent/5">
                        <td className="px-3 py-2 font-semibold">{r.symbol}</td>
                        <td className="px-3 py-2 text-muted">{r.exchange}</td>
                        <td className="px-3 py-2 text-right tnum">{r.quantity}</td>
                        <td className="px-3 py-2 text-right tnum">{mask(fmt.money(D(r.avgCost).times(D(r.quantity))), ghost)}</td>
                        <td className="px-3 py-2 text-right tnum">{r.lastPrice ? mask(fmt.money(D(r.lastPrice)), ghost) : '—'}</td>
                        <td className="px-3 py-2 text-muted">{ASSET_META[r.assetType].label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <Button variant="primary" onClick={confirmImport} disabled={importing}>
                  <CheckCircle2 size={15} />
                  {importing ? 'Importing…' : `Confirm Import (${preview.length} holdings)`}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </GlassCard>
  );
}

// ── Holding row (main row + collapsible XIRR/tax detail) ─────────────────────
type Dec = import('decimal.js').default;
interface HoldingView { holding: Holding; invested: Dec; current: Dec; pnl: Dec; pnlPct: number }

function HoldingRow({ v, isEditing, onEdit, onClose, onDelete, ghost }: {
  v: HoldingView; isEditing: boolean; onEdit: () => void; onClose: () => void; onDelete: () => void; ghost: boolean;
}) {
  const fmt = useFmt();
  const [open, setOpen] = useState(false);
  const { holding: h, invested, current, pnl, pnlPct } = v;
  const meta = ASSET_META[h.assetType];
  const isPos = pnl.gte(0);
  const price = h.lastPrice ? D(h.lastPrice) : D(h.avgCost);
  const hasDate = h.firstPurchaseDate != null && h.firstPurchaseDate > 0;

  const xirrPct = useMemo(
    () => (hasDate ? xirr([
      { when: h.firstPurchaseDate!, amount: -invested.toNumber() },
      { when: Date.now(), amount: current.toNumber() },
    ]) : null),
    [hasDate, h.firstPurchaseDate, invested, current],
  );
  const gainResult = useMemo(() => {
    if (!hasDate) return null;
    const g = computeGain(h.assetType, new Date(h.firstPurchaseDate!), new Date(), invested, current);
    return g.gain.gt(0) ? g : null;
  }, [hasDate, h.assetType, h.firstPurchaseDate, invested, current]);

  const cell = 'py-3 pr-3 text-right tnum whitespace-nowrap';
  return (
    <React.Fragment>
      <tr className={`border-t border-[var(--line)] transition-colors hover:bg-[var(--fill)]${isEditing ? ' bg-[rgba(52,64,107,0.05)]' : ''}`}>
        <td className="py-3 pr-3 max-w-[150px]">
          <div className="font-semibold text-ink leading-tight truncate">{h.symbol}</div>
          <div className="text-[11px] text-muted truncate">{h.exchange}</div>
        </td>
        <td className="py-3 pr-3 hidden sm:table-cell">
          <span className="inline-block whitespace-nowrap text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: meta.color + '16', color: meta.color }}>{meta.label}</span>
        </td>
        <td className={`${cell} text-ink-soft`}>{D(h.quantity).toFixed(2)}</td>
        <td className={`${cell} text-ink-soft hidden md:table-cell`}>{mask(fmt.money(D(h.avgCost)), ghost)}</td>
        <td className={`${cell} text-ink-soft hidden md:table-cell`}>{mask(fmt.money(price), ghost)}</td>
        <td className={`${cell} font-semibold`}>{mask(fmt.money(current), ghost)}</td>
        <td className="py-3 pr-3 text-right whitespace-nowrap">
          <div className="font-semibold tnum" style={{ color: pnlColor(pnlPct) }}>{ghost ? '••••' : fmt.signed(pnl, isPos)}</div>
          <div className="text-[11px] tnum" style={{ color: pnlColor(pnlPct) }}>{ghost ? '' : `${isPos ? '+' : ''}${pnlPct.toFixed(2)}%`}</div>
        </td>
        <td className="py-3 pl-1 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-0.5">
            {hasDate && (
              <button onClick={() => setOpen((o) => !o)} title="XIRR & tax"
                className="text-muted hover:text-ink p-1 rounded-md hover:bg-[var(--fill)] transition-colors">
                {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
            <button onClick={isEditing ? onClose : onEdit} title="Edit"
              className="text-muted hover:text-ink p-1 rounded-md hover:bg-[var(--fill)] transition-colors"><Pencil size={13} /></button>
            <button onClick={onDelete} title="Delete"
              className="text-muted hover:text-expense p-1 rounded-md hover:bg-[rgba(192,73,47,0.08)] transition-colors"><Trash2 size={13} /></button>
          </div>
        </td>
      </tr>
      {open && hasDate && (
        <tr className="bg-[var(--fill)]">
          <td colSpan={8} className="px-3 pb-3 pt-0">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
              {xirrPct !== null && (
                <span className="font-semibold" style={{ color: xirrPct >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                  XIRR {xirrPct >= 0 ? '+' : ''}{xirrPct.toFixed(1)}% p.a.
                </span>
              )}
              {gainResult && (
                <span className="text-ink-soft">
                  {gainResult.gainType === 'long_term' ? 'LTCG' : 'STCG'} · est. tax {mask(fmt.money(gainResult.estimatedTax), ghost)} ({gainResult.rateLabel})
                </span>
              )}
              {xirrPct === null && !gainResult && <span className="text-muted">No realised gain to report yet.</span>}
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

// ── Tax Summary Card ──────────────────────────────────────────────────────────

import type { HoldingView as HV } from '@/domain/portfolio';

function TaxSummaryCard({ views, ghost }: { views: HV[]; ghost: boolean }) {
  const fmt = useFmt();

  const { hasAny, totalGain, ltGain, stGain, estTax } = useMemo(() => {
    const dated = views.filter(
      (v) => v.holding.firstPurchaseDate != null && (v.holding.firstPurchaseDate ?? 0) > 0,
    );
    if (dated.length === 0) return { hasAny: false, totalGain: ZERO, ltGain: ZERO, stGain: ZERO, estTax: ZERO };

    let totalGain = ZERO;
    let ltGain = ZERO;
    let stGain = ZERO;
    let estTax = ZERO;

    for (const v of dated) {
      const g = computeGain(
        v.holding.assetType,
        new Date(v.holding.firstPurchaseDate!),
        new Date(),
        v.invested,
        v.current,
      );
      totalGain = totalGain.plus(g.gain);
      if (g.gainType === 'long_term') {
        ltGain = ltGain.plus(g.gain);
      } else {
        stGain = stGain.plus(g.gain);
      }
      if (g.gain.gt(0)) {
        estTax = estTax.plus(g.estimatedTax);
      }
    }

    return { hasAny: true, totalGain, ltGain, stGain, estTax };
  }, [views]);

  return (
    <GlassCard>
      <SectionHeader title="Tax summary (if sold today)" />
      {!hasAny ? (
        <p className="text-xs text-muted mt-3">
          Add purchase dates to your holdings to see capital-gains tax estimates.
        </p>
      ) : (
        <>
          <div className="mt-3">
            <StatStrip
              items={[
                {
                  label: 'Unrealised gain',
                  value: mask(fmt.money(totalGain.abs()), ghost),
                  sub: totalGain.gte(0) ? 'Overall gain' : 'Overall loss',
                  accent: totalGain.gte(0) ? 'var(--income)' : 'var(--expense)',
                },
                {
                  label: 'Long-term gains',
                  value: mask(fmt.money(ltGain.abs()), ghost),
                  sub: ltGain.lt(0) ? 'Long-term loss' : undefined,
                  accent: ltGain.lt(0) ? 'var(--expense)' : undefined,
                },
                {
                  label: 'Short-term gains',
                  value: mask(fmt.money(stGain.abs()), ghost),
                  sub: stGain.lt(0) ? 'Short-term loss' : undefined,
                  accent: stGain.lt(0) ? 'var(--expense)' : undefined,
                },
                {
                  label: 'Est. tax if sold',
                  value: mask(fmt.money(estTax), ghost),
                  sub: estTax.isZero() ? 'Exempt / loss' : undefined,
                  accent: 'var(--expense)',
                },
              ]}
            />
          </div>
          <p className="text-[11px] text-muted mt-3 leading-relaxed">
            Estimates use current holding period and standard rates; not tax advice. Holdings without a purchase date are excluded.
          </p>
        </>
      )}
    </GlassCard>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────


// ---- Sector-wise P&L breakdown ----------------------------------------------
// Mirrors the Flutter Breakdown screen. Sector, industry and market cap come
// from the bundled instrument master (offline: classifying by API would reveal
// which stocks you own). Anything unmatched shows as "Unclassified" rather than
// being guessed at.

const DIMENSIONS: { value: RollupDimension; label: string }[] = [
  { value: 'sector', label: 'Sector' },
  { value: 'industry', label: 'Industry' },
  { value: 'marketCap', label: 'Market cap' },
  { value: 'assetGroup', label: 'Asset class' },
];

function BreakdownCard({
  holdings, master, ghost, fmt,
}: {
  holdings: Holding[];
  master: InstrumentMaster;
  ghost: boolean;
  fmt: ReturnType<typeof useFmt>;
}) {
  const [dim, setDim] = useState<RollupDimension>('sector');

  const classify = useCallback(
    (h: Holding) => lookupClassification(master, { symbol: h.symbol }),
    [master],
  );

  const rows = useMemo(() => rollup(holdings, dim, classify), [holdings, dim, classify]);
  const summary = useMemo(() => portfolioSummary(holdings), [holdings]);
  const totalValue = summary.current;
  const unclassified = rows.find((r) => r.key === UNCLASSIFIED_KEY);

  if (holdings.length === 0) return null;

  const money = (v: Decimal) => (ghost ? '••••' : fmt.money(v.toString()));
  const signed = (v: Decimal) =>
    ghost ? '••••' : `${v.isNegative() ? '-' : '+'}${fmt.money(v.abs().toString())}`;
  const pnlClass = (v: Decimal) =>
    v.isZero() ? 'text-muted' : v.isNegative() ? 'text-[var(--expense)]' : 'text-[var(--income)]';

  return (
    <GlassCard className="lg:col-span-5">
      <SectionHeader title="Profit &amp; loss breakdown" />

      <div className="mt-3 flex flex-wrap gap-2">
        {DIMENSIONS.map((d) => (
          <button
            key={d.value}
            type="button"
            onClick={() => setDim(d.value)}
            className={clsx(
              'px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition',
              dim === d.value
                ? 'bg-[var(--primary)] text-[var(--primary-fg)] border-transparent'
                : 'border-[var(--line)] text-ink-soft hover:bg-[var(--fill)]',
            )}
          >
            {d.label}
          </button>
        ))}
      </div>

      {unclassified && unclassified.holdingCount > 0 && (
        <p className="mt-3 text-xs text-muted">
          {unclassified.holdingCount} holding{unclassified.holdingCount === 1 ? '' : 's'} could
          not be classified and appear under &ldquo;Unclassified&rdquo;. The bundled sector list
          covers common Indian large caps; an honest gap beats a wrong sector.
        </p>
      )}

      <div className="overflow-x-auto -mx-1 px-1 mt-3">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-muted border-b border-[var(--line)]">
              <th className="py-2 px-3 font-medium">{DIMENSIONS.find((d) => d.value === dim)?.label}</th>
              <th className="py-2 px-3 font-medium text-right">Invested</th>
              <th className="py-2 px-3 font-medium text-right">Value</th>
              <th className="py-2 px-3 font-medium text-right">P&amp;L</th>
              <th className="py-2 px-3 font-medium text-right">Return</th>
              <th className="py-2 px-3 font-medium text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: RollupRow) => {
              const share = totalValue.isZero()
                ? 0
                : r.current.div(totalValue).times(100).toNumber();
              return (
                <tr key={r.key} className="border-b border-[var(--line)] last:border-0">
                  <td className="py-2 px-3">
                    <div className="font-semibold">{r.label}</div>
                    <div className="text-xs text-muted">
                      {r.holdingCount} holding{r.holdingCount === 1 ? '' : 's'}
                      {r.unpricedCount > 0 ? ` · ${r.unpricedCount} unpriced` : ''}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">{money(r.invested)}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-semibold">{money(r.current)}</td>
                  <td className={clsx('py-2 px-3 text-right tabular-nums font-semibold', pnlClass(r.pnl))}>
                    {signed(r.pnl)}
                  </td>
                  <td className={clsx('py-2 px-3 text-right tabular-nums', pnlClass(r.pnl))}>
                    {/* An undefined percentage renders as a dash, never as 0%. */}
                    {r.pnlPct === null ? '—' : `${r.pnlPct >= 0 ? '+' : ''}${r.pnlPct.toFixed(2)}%`}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted">{share.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {/* Reconciliation row: if this ever disagrees with the rows above,
                the roll-up is wrong. The paired unit tests assert it cannot. */}
            <tr className="border-t-2 border-[var(--line)] font-bold">
              <td className="py-2 px-3">Total</td>
              <td className="py-2 px-3 text-right tabular-nums">{money(summary.invested)}</td>
              <td className="py-2 px-3 text-right tabular-nums">{money(summary.current)}</td>
              <td className={clsx('py-2 px-3 text-right tabular-nums', pnlClass(summary.pnl))}>
                {signed(summary.pnl)}
              </td>
              <td className="py-2 px-3" />
              <td className="py-2 px-3" />
            </tr>
          </tfoot>
        </table>
      </div>
    </GlassCard>
  );
}

export default function InvestmentsPage() {
  // Bundled sector/industry/cap table. A fetch failure degrades to "no
  // classification" rather than breaking the page.
  const [master, setMaster] = useState<InstrumentMaster>(EMPTY_MASTER);
  useEffect(() => {
    let alive = true;
    loadInstrumentMaster().then((m) => { if (alive) setMaster(m); });
    return () => { alive = false; };
  }, []);
  const classify = useCallback(
    (h: Holding) => lookupClassification(master, { symbol: h.symbol }),
    [master],
  );
  // Chart colours follow the *resolved* theme, not the stored preference —
  // 'system' is not a colour.
  const dark = useDarkMode();

  const holdings = useApp((s) => s.holdings);
  const ghost = useApp((s) => s.ghost);
  const del = useApp((s) => s.del);
  const fmt = useFmt();
  const confirm = useConfirm();

  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  // editHolding: the holding being edited (null = none)
  const [editHolding, setEditHolding] = useState<Holding | null>(null);

  const summary = useMemo(() => portfolioSummary(holdings), [holdings]);

  // Sort views by current value DESC
  const sortedViews = useMemo(
    () => [...summary.views].sort((a, b) => b.current.minus(a.current).toNumber()),
    [summary.views],
  );

  // Colour by asset GROUP in the fixed validated order — not by asset type and
  // not value-sorted. Eleven categorical hues cannot be kept colourblind-
  // separable, and sorting slices by value makes the adjacency data-dependent,
  // which is exactly the case the palette fails (worst pair dE 3.2 protan).
  //
  // Children inherit their parent's hue at successive lightness steps, keyed on
  // position in the roll-up rather than on value, so a price move does not
  // repaint the chart. Both the light and dark validated steps are wired.
  const allocationRoot = useMemo((): SunburstNode => {
    const nodes = sunburst(holdings, classify);
    return {
      key: 'portfolio',
      label: 'Portfolio',
      value: summary.current.toNumber(),
      color: 'transparent',
      children: nodes.map((n) => {
        const group = n.row.key as AssetGroup;
        const shades = groupShades(group, n.children.length, dark);
        return {
          key: n.row.key,
          label: n.row.label,
          value: n.row.current.toNumber(),
          color: dark ? ASSET_GROUP_META[group].dark : ASSET_GROUP_META[group].light,
          children: n.children.map((c, i) => ({
            key: c.key,
            label: c.label,
            value: c.current.toNumber(),
            // Past the ramp's cap, children share its last step; the caption
            // and legend labels are what keep them apart.
            color: shades[Math.min(i, shades.length - 1)],
          })),
        };
      }),
    };
  }, [holdings, classify, summary.current, dark]);

  // The bundled classification table is a starter set, so a real portfolio can
  // land largely in "Unclassified". Said out loud rather than rendered as a big
  // grey wedge with no explanation — that gap is the app's, not the user's.
  const unclassifiedShare = useMemo(() => {
    if (summary.current.lte(0)) return null;
    const rows = rollup(holdings, 'sector', classify);
    const un = rows.find((r) => r.key === UNCLASSIFIED_KEY);
    if (!un || un.current.lte(0)) return null;
    return un.current.div(summary.current).toNumber();
  }, [holdings, classify, summary.current]);

  // Portfolio-level XIRR — collect one outflow per dated holding + one total inflow now
  const portfolioXirr = useMemo(() => {
    const flows: { when: number; amount: number }[] = [];
    for (const { holding: h, invested, current } of summary.views) {
      if (h.firstPurchaseDate != null && h.firstPurchaseDate > 0 && invested.gt(0)) {
        flows.push({ when: h.firstPurchaseDate, amount: -invested.toNumber() });
      }
      // collect current as single terminal inflow keyed to now — handled below
      void current;
    }
    if (flows.length === 0) return null;
    // total current value as single inflow at now
    const totalCurrent = summary.views
      .filter((v) => v.holding.firstPurchaseDate != null && (v.holding.firstPurchaseDate ?? 0) > 0)
      .reduce((s, v) => s + v.current.toNumber(), 0);
    flows.push({ when: Date.now(), amount: totalCurrent });
    return xirr(flows);
  }, [summary.views]);

  const pnlIsPositive = summary.pnl.gte(0);

  async function deleteHolding(id: string, symbol: string) {
    if (!(await confirm({ title: `Delete ${symbol}?`, message: 'This holding will be removed. This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    await del(STORE.holding, id);
  }

  function openEdit(h: Holding) {
    setEditHolding(h);
    setShowAdd(false);
    setShowImport(false);
  }

  function closeEdit() {
    setEditHolding(null);
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Investments"
        subtitle="Portfolio overview and holdings"
        action={
          <div className="flex gap-2">
            <Button variant="soft" onClick={() => { setShowImport((v) => !v); setShowAdd(false); setEditHolding(null); }}>
              <Upload size={15} />
              {showImport ? 'Close' : 'Import CSV'}
            </Button>
            <Button variant="primary" onClick={() => { setShowAdd((v) => !v); setShowImport(false); setEditHolding(null); }}>
              {showAdd ? <ChevronUp size={15} /> : <Plus size={15} />}
              {showAdd ? 'Close' : 'Add Holding'}
            </Button>
          </div>
        }
      />

      {/* Add form */}
      {showAdd && (
        <HoldingForm onClose={() => setShowAdd(false)} />
      )}

      {/* Edit form */}
      {editHolding && (
        <HoldingForm
          key={editHolding.id}
          initial={holdingToForm(editHolding)}
          editId={editHolding.id}
          onClose={closeEdit}
        />
      )}

      {/* Import panel */}
      {showImport && <ImportPanel onClose={() => setShowImport(false)} />}

      {/* Hero card */}
      {holdings.length > 0 && (
        <div className="hero-gradient rounded-[20px] p-6 text-white">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <span className="text-[11px] tracking-widest text-white/70 font-semibold">CURRENT VALUE</span>
              <div className="text-3xl font-extrabold mt-1 tnum">
                {mask(fmt.money(summary.current), ghost)}
              </div>
              {portfolioXirr !== null && !ghost && (
                <div
                  className="text-xs mt-1 font-semibold opacity-90"
                  style={{ color: portfolioXirr >= 0 ? '#34d399' : '#fca5a5' }}
                >
                  Portfolio XIRR {portfolioXirr >= 0 ? '+' : ''}{portfolioXirr.toFixed(1)}% p.a.
                </div>
              )}
            </div>
            <div>
              <span className="text-[11px] tracking-widest text-white/70 font-semibold">INVESTED</span>
              <div className="text-xl font-bold mt-1 tnum">
                {mask(fmt.money(summary.invested), ghost)}
              </div>
            </div>
            <div>
              <span className="text-[11px] tracking-widest text-white/70 font-semibold">TOTAL P&amp;L</span>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="text-xl font-bold tnum"
                  style={{ color: pnlIsPositive ? '#34d399' : '#fca5a5' }}
                >
                  {ghost
                    ? '••••••'
                    : fmt.signed(summary.pnl, pnlIsPositive)}
                </span>
                <span
                  className="flex items-center gap-0.5 text-sm font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: pnlIsPositive ? 'rgba(52,211,153,0.2)' : 'rgba(252,165,165,0.2)',
                    color: pnlIsPositive ? '#34d399' : '#fca5a5',
                  }}
                >
                  {pnlIsPositive ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {ghost ? '••' : `${Math.abs(summary.pnlPct).toFixed(2)}%`}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Allocation + holdings */}
      {holdings.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<TrendingUp size={22} />}
            title="No holdings yet"
            hint="Add your first holding manually or import from a broker CSV to see your portfolio."
            action={
              <Button variant="primary" onClick={() => setShowAdd(true)}>
                <Plus size={15} /> Add Holding
              </Button>
            }
          />
        </GlassCard>
      ) : (
        <div className="grid lg:grid-cols-5 gap-4 items-start">
          {/* Allocation sunburst — asset class, then sector inside it. */}
          <GlassCard className="lg:col-span-2">
            <SectionHeader title="Allocation" />
            <p className="text-[11.5px] text-muted -mt-2 mb-3">
              Asset class, then sector inside it. Click a slice to zoom in.
            </p>
            <Sunburst
              root={allocationRoot}
              size={220}
              centerSub="Total value"
              formatValue={(v) => (ghost ? '••••' : compact(v, fmt.symbol))}
            />
            {unclassifiedShare != null && unclassifiedShare > 0.15 && (
              <p className="text-[11.5px] text-muted mt-3">
                {Math.round(unclassifiedShare * 100)}% of your holdings have no
                sector yet — the bundled classification covers a starter set.
              </p>
            )}
          </GlassCard>

          <BreakdownCard
            holdings={holdings}
            master={master}
            ghost={ghost}
            fmt={fmt}
          />

          {/* Holdings list — sorted by current value DESC */}
          <GlassCard className="lg:col-span-3">
            <SectionHeader title={`Holdings (${holdings.length})`} />
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="pb-2.5 pr-3 font-medium">Symbol</th>
                    <th className="pb-2.5 pr-3 font-medium hidden sm:table-cell">Type</th>
                    <th className="pb-2.5 pr-3 text-right font-medium">Qty</th>
                    <th className="pb-2.5 pr-3 text-right font-medium hidden md:table-cell">Avg Cost</th>
                    <th className="pb-2.5 pr-3 text-right font-medium hidden md:table-cell">Last Price</th>
                    <th className="pb-2.5 pr-3 text-right font-medium">Value</th>
                    <th className="pb-2.5 pr-3 text-right font-medium">P&amp;L</th>
                    <th className="pb-2.5 w-[84px]" />
                  </tr>
                </thead>
                <tbody>
                  {sortedViews.map((v) => (
                    <HoldingRow
                      key={v.holding.id}
                      v={v}
                      isEditing={editHolding?.id === v.holding.id}
                      onEdit={() => openEdit(v.holding)}
                      onClose={closeEdit}
                      onDelete={() => deleteHolding(v.holding.id, v.holding.symbol)}
                      ghost={ghost}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Tax summary card */}
      {holdings.length > 0 && <TaxSummaryCard views={summary.views} ghost={ghost} />}

      {/* Tax note */}
      {holdings.length > 0 && (
        <p className="text-xs text-muted px-1">
          Tax estimates for equity ETF: STCG 20%, LTCG 12.5% (exempt up to ₹1.25L) after 12 months.
          Debt MF and gold ETF gains are taxed as per applicable slabs. Consult a tax advisor.
        </p>
      )}
    </div>
  );
}
