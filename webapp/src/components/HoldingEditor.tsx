'use client';
/**
 * Add / edit a holding, and import a broker CSV.
 *
 * Both used to live inside the 1000-line `/investments` screen. When that
 * screen became the Portfolio Overview they moved here, next to the position
 * grid they operate on.
 */
import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Upload, X, Trash2 } from 'lucide-react';
import { useApp, uid } from '@/lib/store';
import { STORE, type AssetType, type Holding } from '@/lib/types';
import { ASSET_META } from '@/domain/portfolio';
import { MARKET_CAP_LABEL, SECTOR_SUGGESTIONS } from '@/domain/instrumentMaster';
import { parseHoldingsCsv, planImport, importCounts, type CsvHolding } from '@/lib/holdingsCsv';
import { Button, Field, Input, Select, GlassCard, Chip } from './ui';
import { DateInput } from './DateInput';
import { NumberInput } from './NumberInput';
import { isFixedIncome, PAYOUT_LABEL } from '@/domain/fixedIncome';
import { CURRENCIES } from '@/domain/currency';
import { Combobox } from './Combobox';
import { useConfirm } from './Confirm';

const BLANK = {
  symbol: '', name: '', exchange: 'NSE', quantity: '', avgCost: '', lastPrice: '', previousClose: '',
  assetType: 'equity_etf' as AssetType, firstPurchaseDate: '',
  sector: '', marketCapBand: '', country: '',
  couponRatePct: '', maturityDate: '', payoutFrequency: 'cumulative',
  currency: 'INR', fxRateAtPurchase: '',
};

/* -------------------------------------------------------------------------- */

export function HoldingForm({ editing, onDone }: { editing?: Holding | null; onDone: () => void }) {
  const put = useApp((s) => s.put);
  const del = useApp((s) => s.del);
  const vaultId = useApp((s) => s.vaultId);
  const confirm = useConfirm();

  const [f, setF] = useState(() => (editing ? {
    symbol: editing.symbol,
    name: editing.name ?? '',
    exchange: editing.exchange,
    quantity: editing.quantity,
    avgCost: editing.avgCost,
    lastPrice: editing.lastPrice ?? '',
    previousClose: editing.previousClose ?? '',
    assetType: editing.assetType,
    firstPurchaseDate: editing.firstPurchaseDate ? new Date(editing.firstPurchaseDate).toISOString().slice(0, 10) : '',
    sector: editing.sector ?? '',
    marketCapBand: editing.marketCapBand ?? '',
    country: editing.country ?? '',
    couponRatePct: editing.couponRatePct ?? '',
    maturityDate: editing.maturityDate ? new Date(editing.maturityDate).toISOString().slice(0, 10) : '',
    payoutFrequency: editing.payoutFrequency ?? 'cumulative',
    currency: editing.currency ?? 'INR',
    fxRateAtPurchase: editing.fxRateAtPurchase ?? '',
  } : BLANK));

  // A bond or FD is valued by accrual, not by price, so it needs a rate and a
  // term. Shown only for those types — asking a stock for its coupon would be
  // noise, and leaving the fields off entirely is what made the return ₹0.
  const fixedIncome = isFixedIncome(f.assetType);

  const valid = f.symbol.trim() && parseFloat(f.quantity) > 0 && parseFloat(f.avgCost) >= 0;

  const save = async () => {
    if (!valid) return;
    await put(STORE.holding, {
      // Spread first so fields this form does not surface — sector, country,
      // marketCapBand, priceAsOf — survive an edit. Writing a bare literal here
      // used to wipe them, which quietly disarmed the day-change column every
      // time a position was touched.
      ...(editing ?? {}),
      id: editing?.id ?? uid(),
      vaultId,
      symbol: f.symbol.trim().toUpperCase(),
      name: f.name.trim() || null,
      exchange: f.exchange,
      quantity: String(parseFloat(f.quantity)),
      avgCost: String(parseFloat(f.avgCost)),
      lastPrice: f.lastPrice ? String(parseFloat(f.lastPrice)) : null,
      previousClose: f.previousClose ? String(parseFloat(f.previousClose)) : null,
      assetType: f.assetType,
      // Without a purchase date there is no holding period, so the Tax Center
      // cannot classify the gain. The field says as much in its hint.
      firstPurchaseDate: f.firstPurchaseDate ? new Date(f.firstPurchaseDate).getTime() : null,
      // Blank means "not overridden", which falls back to the instrument
      // master — not "Unclassified". Storing '' would pin the holding to an
      // empty sector and defeat the lookup.
      sector: f.sector.trim() || null,
      marketCapBand: (f.marketCapBand || null) as Holding['marketCapBand'],
      country: f.country.trim().toUpperCase() || null,
      // Cleared when the type is not interest-bearing, so switching a bond to
      // a stock cannot leave a stale coupon quietly driving its valuation.
      couponRatePct: fixedIncome && f.couponRatePct.trim() ? f.couponRatePct.trim() : null,
      maturityDate: fixedIncome && f.maturityDate ? new Date(f.maturityDate).getTime() : null,
      payoutFrequency: fixedIncome ? (f.payoutFrequency as Holding['payoutFrequency']) : null,
      // INR is the base, so recording it explicitly would be noise. A purchase
      // rate only means anything for a foreign holding.
      currency: f.currency && f.currency !== 'INR' ? f.currency : null,
      fxRateAtPurchase: f.currency !== 'INR' && f.fxRateAtPurchase.trim()
        ? f.fxRateAtPurchase.trim() : null,
    } as unknown as Holding & { id: string } & Record<string, unknown>);
    onDone();
  };

  const remove = async () => {
    if (!editing) return;
    if (await confirm({
      title: `Delete ${editing.symbol}?`,
      message: 'The position is removed from your portfolio. This cannot be undone.',
      confirmLabel: 'Delete', danger: true,
    })) {
      await del(STORE.holding, editing.id);
      onDone();
    }
  };

  return (
    <GlassCard>
      <div className="flex items-center gap-3 mb-5">
        <h3 className="text-[15px] font-semibold tracking-[-0.02em]">{editing ? `Edit ${editing.symbol}` : 'Add a holding'}</h3>
        <button onClick={onDone} aria-label="Close" className="ml-auto focus-ring p-1.5 rounded-lg text-muted hover:text-ink hover:bg-fill transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 min-[1100px]:grid-cols-4">
        <Field label="Symbol"><Input value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} placeholder="RELIANCE" /></Field>
        <Field label="Company name" hint="Optional"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Reliance Industries" /></Field>
        <Field label="Exchange">
          <Select value={f.exchange} onChange={(e) => setF({ ...f, exchange: e.target.value })}>
            <option value="NSE">NSE</option><option value="BSE">BSE</option>
          </Select>
        </Field>
        <Field label="Asset type">
          <Select value={f.assetType} onChange={(e) => setF({ ...f, assetType: e.target.value as AssetType })}>
            {Object.entries(ASSET_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="Quantity"><NumberInput value={f.quantity} onChange={(v) => setF({ ...f, quantity: v })} placeholder="100" /></Field>
        <Field label="Average cost"><NumberInput value={f.avgCost} onChange={(v) => setF({ ...f, avgCost: v })} placeholder="2118.40" /></Field>
        <Field label="Last price" hint="Blank values the position at cost">
          <NumberInput value={f.lastPrice} onChange={(v) => setF({ ...f, lastPrice: v })} placeholder="2645.00" />
        </Field>
        <Field label="Previous close" hint="Yesterday's close — enables Today's P&L">
          <NumberInput value={f.previousClose} onChange={(v) => setF({ ...f, previousClose: v })} placeholder="2631.75" />
        </Field>
        <Field label="First purchase" hint="Needed for XIRR and capital-gains type">
          <DateInput value={f.firstPurchaseDate} onChange={(firstPurchaseDate) => setF({ ...f, firstPurchaseDate })} />
        </Field>
        {/* Classification overrides. Blank falls back to the bundled instrument
            master; these exist for what the master does not cover — ETFs,
            foreign stock, anything unlisted. */}
        <Field label="Sector" hint="Blank uses the built-in lookup">
          <Combobox
            value={f.sector}
            onChange={(sector) => setF({ ...f, sector })}
            options={SECTOR_SUGGESTIONS}
            placeholder="Information Technology"
          />
        </Field>
        <Field label="Market cap" hint="Blank uses the built-in lookup">
          <Select value={f.marketCapBand} onChange={(e) => setF({ ...f, marketCapBand: e.target.value })}>
            <option value="">Auto</option>
            {Object.entries(MARKET_CAP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Country" hint="Two-letter code, e.g. IN">
          <Input value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} placeholder="IN" maxLength={2} />
        </Field>

        <Field label="Currency" hint="Currency of the cost and price above">
          <Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
          </Select>
        </Field>
        {f.currency !== 'INR' && (
          <Field label="Exchange rate at purchase" hint={`INR per 1 ${f.currency}. Blank uses today's rate.`}>
            <NumberInput value={f.fxRateAtPurchase} onChange={(v) => setF({ ...f, fxRateAtPurchase: v })} placeholder="83.30" />
          </Field>
        )}

        {fixedIncome && (
          <>
            <Field label="Interest rate" hint="Annual %, e.g. 7.1">
              <NumberInput value={f.couponRatePct} onChange={(v) => setF({ ...f, couponRatePct: v })} placeholder="7.1" />
            </Field>
            <Field label="Maturity date" hint="Interest stops accruing here">
              <DateInput value={f.maturityDate} onChange={(maturityDate) => setF({ ...f, maturityDate })} />
            </Field>
            <Field label="Interest payout" hint="Cumulative compounds until maturity">
              <Select value={f.payoutFrequency} onChange={(e) => setF({ ...f, payoutFrequency: e.target.value })}>
                {Object.entries(PAYOUT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </>
        )}
      </div>

      {fixedIncome && (
        <p className="mt-3 text-[12px] text-muted leading-relaxed">
          Quantity 1 and average cost = the amount deposited. Value is principal plus interest
          earned to date, so it grows daily rather than sitting at cost until maturity.
        </p>
      )}

      <div className="flex gap-2 mt-5 flex-wrap">
        <Button onClick={() => void save()} disabled={!valid}>{editing ? 'Save changes' : 'Add holding'}</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        {editing && (
          <Button variant="danger" className="ml-auto" onClick={() => void remove()}>
            <Trash2 size={15} />Delete
          </Button>
        )}
      </div>
    </GlassCard>
  );
}

/* -------------------------------------------------------------------------- */

export function ImportPanel({ onDone }: { onDone: () => void }) {
  const put = useApp((s) => s.put);
  const vaultId = useApp((s) => s.vaultId);
  const holdings = useApp((s) => s.holdings);
  const fileRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('equity_etf');
  const [preview, setPreview] = useState<CsvHolding[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState<{ created: number; updated: number } | null>(null);

  // Whether the export carries day-change data at all. Worth saying out loud
  // before the import, not after: without it Today's P&L stays synthetic, and
  // that is the single most common reason it disagrees with the broker's app.
  const withClose = preview?.filter((r) => r.previousClose !== '').length ?? 0;

  // Counts only — the records themselves are built at confirm time, since
  // minting ids and stamping the clock are not render-phase work.
  const counts = useMemo(
    () => (preview?.length ? importCounts(preview, holdings) : null),
    [preview, holdings],
  );

  const parse = (raw: string, type = assetType) => {
    const res = parseHoldingsCsv(raw, type);
    setPreview(res.rows);
    setSkipped(res.skipped);
    setError(res.error);
    setImported(null);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const raw = await file.text();
    setText(raw);
    parse(raw);
  };

  const confirmImport = async () => {
    if (!preview?.length) return;
    const plan = planImport(preview, holdings, { vaultId, newId: uid, now: Date.now() });
    setBusy(true);
    for (const rec of plan.records) {
      await put(STORE.holding, rec as unknown as Holding & { id: string } & Record<string, unknown>);
    }
    setImported({ created: plan.created, updated: plan.updated });
    setPreview(null);
    setText('');
    setBusy(false);
  };

  return (
    <GlassCard>
      <div className="flex items-center gap-3 mb-2">
        <h3 className="text-[15px] font-semibold tracking-[-0.02em]">Import holdings from CSV</h3>
        <button onClick={onDone} aria-label="Close" className="ml-auto focus-ring p-1.5 rounded-lg text-muted hover:text-ink hover:bg-fill transition-colors">
          <X size={16} />
        </button>
      </div>
      <p className="text-[13px] text-ink-soft leading-relaxed mb-4">
        Export your holdings from Zerodha Console, Upstox, Groww or any broker and drop the file here. Columns are matched
        automatically — <b className="text-ink">symbol</b>, <b className="text-ink">quantity</b> and <b className="text-ink">average cost</b> are
        required; last price and exchange are used when present. Keep the
        <b className="text-ink"> previous close</b> or <b className="text-ink">day P&L</b> column if your broker offers one — it is what makes
        Today&rsquo;s P&L a real figure instead of a demo one. Positions you already hold are updated in place, so re-importing
        refreshes prices rather than duplicating the book. Nothing is uploaded; the file is read in this browser.
      </p>

      {imported && (
        <div className="flex items-center gap-2 text-success font-semibold text-[13px] mb-4">
          <CheckCircle2 size={16} />
          Imported {imported.created + imported.updated} holding{imported.created + imported.updated === 1 ? '' : 's'}
          {imported.updated > 0 && ` — ${imported.created} new, ${imported.updated} updated`}.
        </div>
      )}

      <div className="grid gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="soft" onClick={() => fileRef.current?.click()}><Upload size={15} />Choose .csv file</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e)} />
          <div className="min-w-[190px]">
            <Select
              aria-label="Asset type for imported rows"
              value={assetType}
              onChange={(e) => { const t = e.target.value as AssetType; setAssetType(t); if (text) parse(text, t); }}
            >
              {Object.entries(ASSET_META).map(([k, v]) => <option key={k} value={k}>Import as: {v.label}</option>)}
            </Select>
          </div>
        </div>

        <Field label="Or paste the CSV text">
          <textarea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Symbol,Quantity,Avg Cost,LTP,Exchange\nRELIANCE,420,2118.40,2645.00,NSE\nINFY,960,1298.00,1695.40,NSE'}
            className="focus-ring w-full rounded-input border border-line-strong bg-surface text-ink px-3.5 py-2.5 text-xs font-mono outline-none resize-y"
          />
        </Field>

        <div className="flex gap-2">
          <Button variant="soft" onClick={() => parse(text)} disabled={!text.trim()}>Preview</Button>
        </div>
      </div>

      {error && (
        <p className="mt-4 text-[13px] text-danger leading-relaxed">{error}</p>
      )}

      {preview !== null && !error && (
        <div className="mt-5">
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <span className="text-[13px] font-semibold">{preview.length} row{preview.length === 1 ? '' : 's'} ready</span>
            {counts && counts.updated > 0 && <Chip tone="accent">{counts.created} new, {counts.updated} updating existing</Chip>}
            {skipped > 0 && <Chip tone="warning">{skipped} skipped — missing symbol, quantity or cost</Chip>}
            {preview.length > 0 && withClose === 0 && (
              <Chip tone="warning">No previous-close or day-P&L column — Today&rsquo;s P&L will stay in demo</Chip>
            )}
          </div>
          {preview.length === 0 ? (
            <p className="text-[13px] text-danger">No usable rows found.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-panel border border-line max-h-[260px] overflow-y-auto">
                <table className="w-full text-[13px] border-separate border-spacing-0">
                  <thead>
                    <tr>
                      {['Symbol', 'Exch', 'Qty', 'Avg cost', 'Last price', 'Prev close'].map((h, i) => (
                        <th key={h} className={`sticky top-0 bg-card-2 border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted ${i > 1 ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 60).map((r, i) => (
                      <tr key={`${r.symbol}-${i}`}>
                        <td className="px-3 py-2 border-b border-line font-semibold">{r.symbol}</td>
                        <td className="px-3 py-2 border-b border-line text-ink-soft">{r.exchange}</td>
                        <td className="px-3 py-2 border-b border-line text-right tnum">{r.quantity}</td>
                        <td className="px-3 py-2 border-b border-line text-right tnum">{r.avgCost}</td>
                        <td className="px-3 py-2 border-b border-line text-right tnum">{r.lastPrice || <span className="text-muted">—</span>}</td>
                        <td className="px-3 py-2 border-b border-line text-right tnum">
                          {r.previousClose ? Number(r.previousClose).toFixed(2) : <span className="text-muted">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.length > 60 && <p className="text-[11.5px] text-muted mt-2">Showing the first 60 of {preview.length}. All will be imported.</p>}
              <div className="flex gap-2 mt-4">
                <Button onClick={() => void confirmImport()} disabled={busy}>
                  {busy ? 'Importing…'
                    : counts && counts.updated > 0
                      ? `Import ${preview.length} — ${counts.created} new, ${counts.updated} updated`
                      : `Import ${preview.length} holding${preview.length === 1 ? '' : 's'}`}
                </Button>
                <Button variant="ghost" onClick={() => { setPreview(null); setText(''); }}>Clear</Button>
              </div>
            </>
          )}
        </div>
      )}
    </GlassCard>
  );
}
