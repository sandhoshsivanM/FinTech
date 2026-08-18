'use client';
/**
 * Dividend tracker.
 *
 * Dividends are real vault records (`STORE.dividend`) — entered by hand or
 * imported — so everything on this page is the user's own data. Yield is
 * computed against the actual holding value where the symbol matches.
 */
import { useMemo, useState } from 'react';
import { Coins, CalendarClock, Percent, Wallet, Plus, Check } from 'lucide-react';
import { useApp, uid } from '@/lib/store';
import { useFmt } from '@/lib/useFmt';
import { D, ZERO } from '@/lib/money';
import { STORE, type Dividend } from '@/lib/types';
import { PageIntro, Button, Chip, Field, Input, Select, EmptyState, GlassCard } from '@/components/ui';
import { Kpi, KpiRow } from '@/components/Kpi';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { Stagger, StaggerItem } from '@/components/motion';
import { portfolioSummary } from '@/domain/portfolio';
import { short } from '@/lib/format';
import { DateInput } from '@/components/DateInput';
import { formatDate, formatMonthShort } from '@/lib/dateFormat';
import { contains, monthsBack, monthsIn } from '@/domain/period';
import { NumberInput } from '@/components/NumberInput';

const KIND_LABEL: Record<string, string> = { dividend: 'Dividend', interest: 'Interest', bonus: 'Bonus', buyback: 'Buyback' };

export default function DividendsPage() {
  const dividends = useApp((s) => s.dividends);
  const holdings = useApp((s) => s.holdings);
  const fxRates = useApp((s) => s.fxRates);
  const put = useApp((s) => s.put);
  const vaultId = useApp((s) => s.vaultId);
  const fmt = useFmt();
  const [form, setForm] = useState(false);
  const [draft, setDraft] = useState({ symbol: '', amount: '', perShare: '', payDate: new Date().toISOString().slice(0, 10), kind: 'dividend' });

  // "Expected" is simply "not yet received" — no clock needed. Keying it off
  // the current time would also mis-file a payout whose date has passed but
  // which never actually landed.
  const received = useMemo(() => dividends.filter((d) => d.received), [dividends]);
  const upcoming = useMemo(() => dividends.filter((d) => !d.received), [dividends]);

  const totalReceived = received.reduce((s, d) => s.plus(D(d.amount)), ZERO);
  const totalUpcoming = upcoming.reduce((s, d) => s.plus(D(d.amount)), ZERO);
  const portfolioValue = useMemo(() => portfolioSummary(holdings, undefined, fxRates).current, [holdings, fxRates]);
  const yieldPct = portfolioValue.gt(0) ? totalReceived.div(portfolioValue).times(100).toNumber() : null;

  /** Last twelve months, oldest first. Same buckets every other chart uses. */
  const byMonth = useMemo(() => {
    const out: { label: string; value: number }[] = [];
    for (const m of monthsIn(monthsBack(12))) {
      const sum = received
        .filter((x) => contains(m, x.payDate))
        .reduce((s, x) => s + D(x.amount).toNumber(), 0);
      out.push({ label: formatMonthShort(m.start), value: sum });
    }
    return out;
  }, [received]);

  const save = async () => {
    if (!draft.symbol.trim() || !draft.amount) return;
    const pay = new Date(draft.payDate).getTime();
    // Normalise before storing. A trailing space in a typed amount used to be
    // written verbatim and then throw on every render of this page.
    const amount = D(draft.amount).toString();
    const perShare = draft.perShare.trim() ? D(draft.perShare).toString() : null;
    await put(STORE.dividend, {
      id: uid(),
      vaultId,
      symbol: draft.symbol.trim().toUpperCase(),
      kind: draft.kind,
      amount,
      perShare,
      payDate: pay,
      exDate: null,
      received: pay <= Date.now(),
    } as unknown as Dividend & { id: string } & Record<string, unknown>);
    setDraft({ symbol: '', amount: '', perShare: '', payDate: new Date().toISOString().slice(0, 10), kind: 'dividend' });
    setForm(false);
  };

  const markReceived = async (d: Dividend) => {
    await put(STORE.dividend, { ...d, received: true } as unknown as Dividend & { id: string } & Record<string, unknown>);
  };

  const columns: Column<Dividend>[] = [
    { key: 'symbol', header: 'Symbol', locked: true, value: (d) => d.symbol, cell: (d) => <span className="font-semibold">{d.symbol}</span> },
    { key: 'kind', header: 'Type', value: (d) => KIND_LABEL[d.kind] ?? d.kind, cell: (d) => <Chip>{KIND_LABEL[d.kind] ?? d.kind}</Chip> },
    { key: 'perShare', header: 'Per share', align: 'right', optional: true, value: (d) => (d.perShare ? D(d.perShare).toNumber() : 0), cell: (d) => d.perShare ? fmt.money(d.perShare) : <span className="text-muted">—</span> },
    { key: 'amount', header: 'Amount', align: 'right', value: (d) => D(d.amount).toNumber(), cell: (d) => <span className="font-semibold text-success">{fmt.money(d.amount)}</span> },
    { key: 'payDate', header: 'Pay date', align: 'right', value: (d) => d.payDate, cell: (d) => formatDate(d.payDate) },
    {
      key: 'status', header: 'Status', align: 'right', value: (d) => (d.received ? 'Received' : 'Expected'),
      cell: (d) => d.received
        ? <Chip tone="success"><Check size={11} />Received</Chip>
        : <button onClick={() => void markReceived(d)} className="focus-ring"><Chip tone="warning">Mark received</Chip></button>,
    },
  ];

  return (
    <Stagger className="grid gap-6">
      <StaggerItem>
        <PageIntro
          title="Dividends"
          subtitle={dividends.length ? `${received.length} received · ${upcoming.length} expected` : 'Track payouts from the instruments you hold'}
          action={<Button onClick={() => setForm((f) => !f)}><Plus size={16} />Record payout</Button>}
        />
      </StaggerItem>

      {form && (
        <StaggerItem>
          <GlassCard>
            <div className="grid gap-4 md:grid-cols-5">
              <Field label="Symbol"><Input value={draft.symbol} onChange={(e) => setDraft({ ...draft, symbol: e.target.value })} placeholder="ITC" /></Field>
              <Field label="Type">
                <Select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                  {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Per share"><NumberInput value={draft.perShare} onChange={(v) => setDraft({ ...draft, perShare: v })} placeholder="6.25" /></Field>
              <Field label="Total amount"><NumberInput value={draft.amount} onChange={(v) => setDraft({ ...draft, amount: v })} placeholder="13125" /></Field>
              <Field label="Pay date"><DateInput value={draft.payDate} onChange={(payDate) => setDraft({ ...draft, payDate })} /></Field>
            </div>
            <div className="flex gap-2 mt-5">
              <Button onClick={() => void save()}>Save payout</Button>
              <Button variant="ghost" onClick={() => setForm(false)}>Cancel</Button>
            </div>
          </GlassCard>
        </StaggerItem>
      )}

      {dividends.length === 0 ? (
        <StaggerItem>
          <GlassCard padded={false}>
            <EmptyState
              icon={<Coins size={22} />}
              title="No payouts recorded"
              hint="Record a dividend, interest payment or buyback and it will show up here with its yield against your portfolio."
              action={<Button onClick={() => setForm(true)}><Plus size={16} />Record payout</Button>}
            />
          </GlassCard>
        </StaggerItem>
      ) : (
        <>
          <StaggerItem>
            <KpiRow cols={4}>
              <Kpi label="Received" numeric={totalReceived.toNumber()} format={short} icon={Wallet} tone="success" footer={fmt.money(totalReceived)} />
              <Kpi label="Expected" numeric={totalUpcoming.toNumber()} format={short} icon={CalendarClock} tone="warning" footer={`${upcoming.length} scheduled`} />
              <Kpi label="Yield on portfolio" value={yieldPct != null ? `${yieldPct.toFixed(2)}%` : null} icon={Percent} tone="accent" footer={yieldPct != null ? 'Received against current value' : undefined} />
              <Kpi label="Paying instruments" value={String(new Set(dividends.map((d) => d.symbol)).size)} icon={Coins} tone="violet" footer="Distinct symbols" />
            </KpiRow>
          </StaggerItem>

          <StaggerItem>
            <section className="card">
              <div className="px-5 py-4 border-b border-line">
                <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Payouts by month</h2>
                <p className="text-xs text-muted mt-0.5">Received only, last twelve months</p>
              </div>
              <div className="p-5">
                <ColumnChart
                  columns={byMonth}
                  height={220}
                  showValues
                  format={(n) => fmt.money(n)}
                  formatLabel={(n) => short(n, fmt.symbol)}
                  ariaLabel="Dividends received in each of the last twelve months"
                />
              </div>
            </section>
          </StaggerItem>

          <StaggerItem>
            <section className="card overflow-hidden">
              <DataGrid
                rows={[...dividends].sort((a, b) => b.payDate - a.payDate)}
                columns={columns} rowKey={(d) => d.id}
                searchable={(d) => `${d.symbol} ${KIND_LABEL[d.kind] ?? ''}`}
                searchPlaceholder="Search payouts…"
                exportName="khazana-dividends"
              />
            </section>
          </StaggerItem>
        </>
      )}
    </Stagger>
  );
}
