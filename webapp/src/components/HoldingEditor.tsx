'use client';
/**
 * Add / edit a holding, and import a broker CSV.
 *
 * Both used to live inside the 1000-line `/investments` screen. When that
 * screen became the Portfolio Overview they moved here, next to the position
 * grid they operate on.
 */
import { useRef, useState } from 'react';
import { CheckCircle2, Upload, X, Trash2 } from 'lucide-react';
import { useApp, uid } from '@/lib/store';
import { STORE, type AssetType, type Holding } from '@/lib/types';
import { ASSET_META } from '@/domain/portfolio';
import { parseHoldingsCsv, type CsvHolding } from '@/lib/holdingsCsv';
import { Button, Field, Input, Select, GlassCard, Chip } from './ui';
import { useConfirm } from './Confirm';

const BLANK = {
  symbol: '', name: '', exchange: 'NSE', quantity: '', avgCost: '', lastPrice: '',
  assetType: 'equity_etf' as AssetType, firstPurchaseDate: '',
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
    assetType: editing.assetType,
    firstPurchaseDate: editing.firstPurchaseDate ? new Date(editing.firstPurchaseDate).toISOString().slice(0, 10) : '',
  } : BLANK));

  const valid = f.symbol.trim() && parseFloat(f.quantity) > 0 && parseFloat(f.avgCost) >= 0;

  const save = async () => {
    if (!valid) return;
    await put(STORE.holding, {
      id: editing?.id ?? uid(),
      vaultId,
      symbol: f.symbol.trim().toUpperCase(),
      name: f.name.trim() || null,
      exchange: f.exchange,
      quantity: String(parseFloat(f.quantity)),
      avgCost: String(parseFloat(f.avgCost)),
      lastPrice: f.lastPrice ? String(parseFloat(f.lastPrice)) : null,
      assetType: f.assetType,
      // Without a purchase date there is no holding period, so the Tax Center
      // cannot classify the gain. The field says as much in its hint.
      firstPurchaseDate: f.firstPurchaseDate ? new Date(f.firstPurchaseDate).getTime() : null,
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
        <Field label="Quantity"><Input inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} placeholder="100" /></Field>
        <Field label="Average cost"><Input inputMode="decimal" value={f.avgCost} onChange={(e) => setF({ ...f, avgCost: e.target.value })} placeholder="2118.40" /></Field>
        <Field label="Last price" hint="Blank values the position at cost">
          <Input inputMode="decimal" value={f.lastPrice} onChange={(e) => setF({ ...f, lastPrice: e.target.value })} placeholder="2645.00" />
        </Field>
        <Field label="First purchase" hint="Needed for XIRR and capital-gains type">
          <Input type="date" value={f.firstPurchaseDate} onChange={(e) => setF({ ...f, firstPurchaseDate: e.target.value })} />
        </Field>
      </div>

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
  const fileRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('equity_etf');
  const [preview, setPreview] = useState<CsvHolding[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState(0);

  const parse = (raw: string, type = assetType) => {
    const res = parseHoldingsCsv(raw, type);
    setPreview(res.rows);
    setSkipped(res.skipped);
    setError(res.error);
    setImported(0);
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
    setBusy(true);
    for (const r of preview) {
      await put(STORE.holding, {
        id: uid(), vaultId,
        symbol: r.symbol, exchange: r.exchange,
        quantity: r.quantity, avgCost: r.avgCost,
        lastPrice: r.lastPrice || null,
        assetType: r.assetType,
        firstPurchaseDate: null,
      } as unknown as Holding & { id: string } & Record<string, unknown>);
    }
    setImported(preview.length);
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
        required; last price and exchange are used when present. Nothing is uploaded; the file is read in this browser.
      </p>

      {imported > 0 && (
        <div className="flex items-center gap-2 text-success font-semibold text-[13px] mb-4">
          <CheckCircle2 size={16} /> Imported {imported} holding{imported === 1 ? '' : 's'}.
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
            {skipped > 0 && <Chip tone="warning">{skipped} skipped — missing symbol, quantity or cost</Chip>}
          </div>
          {preview.length === 0 ? (
            <p className="text-[13px] text-danger">No usable rows found.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-panel border border-line max-h-[260px] overflow-y-auto">
                <table className="w-full text-[13px] border-separate border-spacing-0">
                  <thead>
                    <tr>
                      {['Symbol', 'Exch', 'Qty', 'Avg cost', 'Last price'].map((h, i) => (
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.length > 60 && <p className="text-[11.5px] text-muted mt-2">Showing the first 60 of {preview.length}. All will be imported.</p>}
              <div className="flex gap-2 mt-4">
                <Button onClick={() => void confirmImport()} disabled={busy}>
                  {busy ? 'Importing…' : `Import ${preview.length} holding${preview.length === 1 ? '' : 's'}`}
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
