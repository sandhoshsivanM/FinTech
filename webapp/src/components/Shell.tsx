'use client';
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  Eye, EyeOff, Lock, Menu, X, Plus, ChevronDown, Check, Search,
  Sun, Moon, Monitor, PanelLeft, Bell, RefreshCw, Download,
  CreditCard, ShieldAlert, BellRing, Inbox,
} from 'lucide-react';
import { APP_NAME } from '@/lib/brand';
import { useApp, type ThemeChoice } from '@/lib/store';
import { marketState } from '@/lib/marketClock';
import { useNow } from '@/lib/useNow';
import { demoIndices, demoSeries } from '@/lib/demo/marketFeed';
import { MiniSparkline } from './charts/MiniSparkline';
import { BrandMark, WordMark } from './BrandMark';
import { DemoBadge, useDemoData } from './DemoBadge';
import { NAV_GROUPS, BOTTOM_NAV, TITLES, isActive } from './navConfig';
import { Tour } from './Tour';
import { CommandPalette } from './CommandPalette';

const KIND_LABEL: Record<string, string> = { self: 'Personal', spouse: 'Spouse', business: 'Business' };
const RAIL_KEY = 'khazana-nav-collapsed';

// A tiny external store for the rail preference. localStorage has no change
// event for same-tab writes, so subscribers are notified by hand.
const railListeners = new Set<() => void>();
function subscribeRail(fn: () => void) {
  railListeners.add(fn);
  return () => { railListeners.delete(fn); };
}
function readRail(): boolean {
  try { return localStorage.getItem(RAIL_KEY) === '1'; } catch { return false; }
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  // `useSyncExternalStore` rather than an effect: it reads the stored value
  // during render on the client while still returning the server snapshot for
  // hydration, so there is no setState-in-effect cascade and no theme flash.
  const rail = useSyncExternalStore(subscribeRail, () => readRail(), () => false);
  const toggleRail = () => {
    const next = !rail;
    try { localStorage.setItem(RAIL_KEY, next ? '1' : '0'); } catch { /* private mode */ }
    railListeners.forEach((fn) => fn());
  };

  const title = TITLES[Object.keys(TITLES).find((k) => path.startsWith(k)) ?? '/dashboard'] ?? APP_NAME;

  return (
    <div className="min-h-screen flex">
      {/* Sidebar. Collapses at 900px rather than Tailwind's 768px `md`: the
          sidebar plus a readable content column needs the extra room, and web
          is served to phones and desktops alike so the breakpoint has to be
          width-driven. Page-level `md:` grids are independent — don't sweep
          them into this. */}
      <aside
        className={clsx(
          'hidden min-[900px]:flex shrink-0 flex-col border-r border-line bg-surface',
          // Sticky, full-height: the page below can be several thousand pixels
          // tall, and a nav that scrolls off the top is not navigation.
          'sticky top-0 h-screen self-start',
          'transition-[width] duration-[250ms] ease-standard',
          rail ? 'w-[76px]' : 'w-[248px]',
        )}
      >
        <Brand rail={rail} />
        <Nav path={path} rail={rail} className="flex-1 px-3 pb-3 overflow-y-auto no-scrollbar" />
        <SidebarFooter rail={rail} />
      </aside>

      {/* Mobile drawer — the full route index below 900px. Rendered only when
          open so `data-tour="nav"` still resolves to exactly one element. */}
      {drawer && (
        <div className="fixed inset-0 z-40 min-[900px]:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
          <aside
            className="absolute left-0 top-0 h-full w-[280px] bg-surface border-r border-line flex flex-col overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pr-3">
              <Brand rail={false} />
              <button onClick={() => setDrawer(false)} className="focus-ring text-ink-soft p-2 rounded-lg" aria-label="Close navigation">
                <X size={20} />
              </button>
            </div>
            <Nav path={path} rail={false} className="flex-1 px-3 pb-3" onNavigate={() => setDrawer(false)} />
            <SidebarFooter rail={false} />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar title={title} onMenu={() => setDrawer(true)} onRail={toggleRail} />
        {/* Bottom padding clears the fixed bar below 900px. */}
        <main className="flex-1 px-4 min-[900px]:px-8 py-6 pb-24 min-[900px]:pb-10">
          <div className="mx-auto max-w-[1560px]">{children}</div>
        </main>
      </div>

      <BottomNav path={path} />
      <CommandPalette />
      <Tour />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function TopBar({ title, onMenu, onRail }: { title: string; onMenu: () => void; onRail: () => void }) {
  const ghost = useApp((s) => s.ghost);
  const toggleGhost = useApp((s) => s.toggleGhost);
  const lock = useApp((s) => s.lock);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 px-4 min-[900px]:px-8 h-16 border-b border-line glass-panel">
      <button
        className="min-[900px]:hidden focus-ring w-9 h-9 grid place-items-center rounded-[10px] text-ink-soft hover:bg-fill"
        onClick={onMenu}
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>
      <button
        className="hidden min-[900px]:grid focus-ring w-9 h-9 place-items-center rounded-[10px] text-ink-soft hover:bg-fill hover:text-ink transition-colors"
        onClick={onRail}
        aria-label="Collapse navigation"
        title="Collapse navigation"
      >
        <PanelLeft size={18} />
      </button>

      <span className="min-[900px]:hidden font-semibold tracking-tight truncate">{title}</span>

      <PortfolioSelector />
      <SearchButton />

      <span className="flex-1" />

      <MarketPill />

      <RefreshButton />
      <ExportButton />
      <NotificationsMenu />

      <ThemeToggle />

      <IconBtn label="Privacy (Ghost mode)" data-tour="ghost" onClick={toggleGhost}>
        {ghost ? <EyeOff size={17} /> : <Eye size={17} />}
      </IconBtn>
      <IconBtn label="Lock vault" onClick={lock}><Lock size={16} /></IconBtn>

      <ProfileMenu />
    </header>
  );
}

function IconBtn({
  children, label, className, ...rest
}: { children: ReactNode; label: string; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={clsx(
        'focus-ring w-9 h-9 shrink-0 grid place-items-center rounded-[10px] text-ink-soft',
        'hover:bg-fill hover:text-ink transition-colors duration-150',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Opens the ⌘K palette by synthesising the shortcut the palette listens for. */
function SearchButton() {
  const open = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
  };
  return (
    <button
      onClick={open}
      className={clsx(
        'hidden min-[1024px]:flex focus-ring items-center gap-2.5 h-9 px-3 min-w-0 flex-1 max-w-[380px]',
        'rounded-btn border border-line bg-card text-muted text-[13px]',
        'hover:border-line-strong transition-colors duration-150',
      )}
    >
      <Search size={15} className="shrink-0" />
      <span className="truncate">Search holdings, transactions, reports…</span>
      <kbd className="ml-auto shrink-0 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md bg-fill-strong border border-line">⌘K</kbd>
    </button>
  );
}

function MarketPill() {
  // Ticks once a minute so the clock stays honest without a render storm.
  const [state, setState] = useState(() => marketState());
  useEffect(() => {
    const id = setInterval(() => setState(marketState()), 60_000);
    return () => clearInterval(id);
  }, []);
  const open = state.phase === 'open';
  const pre = state.phase === 'pre-open';
  return (
    <span
      className={clsx(
        'hidden min-[720px]:inline-flex items-center gap-2 h-8 px-3 rounded-full text-[11.5px] font-semibold whitespace-nowrap',
        open && 'bg-success-soft text-success ring-1 ring-inset ring-[color-mix(in_srgb,var(--success)_26%,transparent)]',
        pre && 'bg-warning-soft text-warning ring-1 ring-inset ring-[color-mix(in_srgb,var(--warning)_30%,transparent)]',
        !open && !pre && 'bg-fill text-muted ring-1 ring-inset ring-line',
      )}
      title={state.minutesToChange != null ? `${state.minutesToChange} min remaining in this session` : undefined}
    >
      <span className={clsx('w-[7px] h-[7px] rounded-full bg-current', open && 'animate-pulse')} />
      <span className="hidden min-[900px]:inline">{state.label} ·</span> {state.clock}
    </span>
  );
}

function PortfolioSelector() {
  const profiles = useApp((s) => s.profiles);
  const activeId = useApp((s) => s.activeProfileId);
  const active = profiles.find((p) => p.id === activeId);
  const initial = (active?.name ?? 'P').charAt(0).toUpperCase();
  return (
    <Link
      href="/settings"
      className={clsx(
        'hidden min-[720px]:flex focus-ring items-center gap-2.5 h-9 pl-1.5 pr-2.5 shrink-0',
        'rounded-btn border border-line bg-card hover:border-line-strong transition-colors duration-150',
      )}
      title="Switch portfolio"
    >
      <span className="w-[26px] h-[26px] grid place-items-center rounded-[8px] bg-accent-soft text-accent text-[11.5px] font-bold ring-1 ring-inset ring-accent-line">
        {initial}
      </span>
      <span className="hidden min-[1024px]:block min-w-0 text-left">
        <span className="block text-[13px] font-semibold leading-tight truncate max-w-[130px]">{active?.name ?? 'Portfolio'}</span>
        <span className="block text-[10.5px] text-muted leading-tight">{KIND_LABEL[active?.kind ?? 'self']}</span>
      </span>
      <ChevronDown size={14} className="text-muted shrink-0" />
    </Link>
  );
}

function Brand({ rail }: { rail: boolean }) {
  return (
    <Link href="/dashboard" className={clsx('flex items-center gap-3 px-5 pt-[18px] pb-4', rail && 'justify-center px-0')}>
      <BrandMark size={34} className="shrink-0" />
      {/* Wordmark only. The full lockup carries the tagline under it, but at
          248px "Your wealth. Your vault." wraps to two lines and eats a nav
          row — so the tagline lives on the vault gate, where it has room. */}
      {!rail && <WordMark className="min-w-0 truncate text-[15px] leading-tight text-ink" />}
    </Link>
  );
}

function Nav({
  path, rail, className, onNavigate,
}: { path: string; rail: boolean; className?: string; onNavigate?: () => void }) {
  return (
    <nav data-tour="nav" className={className}>
      {NAV_GROUPS.map((group, gi) => (
        <div key={group.label} className={gi > 0 ? 'mt-3.5' : undefined}>
          {rail ? (
            gi > 0 && <div className="mx-2.5 mb-2 h-px bg-line" />
          ) : (
            <p className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.11em] text-muted leading-snug">
              {group.label}
            </p>
          )}
          {group.items.map((n) => {
            const active = isActive(n.href, path);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                data-tour={`nav-${n.href.replace('/', '')}`}
                title={rail ? n.label : undefined}
                className={clsx(
                  'flex items-center gap-3 rounded-[11px] mb-0.5 text-[13.5px] leading-[1.45]',
                  'transition-colors duration-150 ease-standard',
                  rail ? 'justify-center p-2.5' : 'px-2.5 py-1.5',
                  // Vault: #12352A on #20C98A. Ledger: #E1F3EB on #087A56.
                  // Both come straight from --accent-soft / --accent.
                  active
                    ? 'bg-accent-soft text-accent font-semibold'
                    : 'text-ink-soft font-medium hover:bg-fill hover:text-ink',
                )}
              >
                <Icon size={17.5} strokeWidth={active ? 2.2 : 1.9} className="shrink-0" />
                {!rail && <span className="truncate">{n.label}</span>}
                {!rail && n.badge != null && (
                  <span className="ml-auto text-[10px] font-bold px-1.5 rounded-full bg-danger text-white">{n.badge}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter({ rail }: { rail: boolean }) {
  return (
    <div className="p-3 border-t border-line grid gap-2.5">
      {!rail && <MarketStatusCard />}
      <Link
        href="/add"
        data-tour="add"
        title="New transaction"
        className={clsx(
          'focus-ring flex items-center justify-center gap-2 rounded-btn h-10',
          'bg-primary text-primary-fg text-[13px] font-semibold',
          'shadow-[0_2px_10px_-3px_color-mix(in_srgb,var(--primary)_75%,transparent)]',
          'hover:shadow-[var(--glow)] transition-shadow duration-[250ms] ease-standard',
        )}
      >
        <Plus size={17} />
        {!rail && 'New Transaction'}
      </Link>
      <p className={clsx('flex items-center gap-2 px-1 text-[11px] text-muted', rail && 'justify-center')}>
        <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_0_3px_var(--success-soft)] shrink-0" />
        {!rail && <span>Encrypted on this device</span>}
      </p>
    </div>
  );
}

/**
 * Phone bottom bar. Five destinations, matching the Flutter app.
 *
 * Carries no `data-tour` attributes on purpose: `Tour.tsx` finds its targets
 * with `querySelector`, which returns the first match in DOM order — the
 * sidebar copy, which is `hidden` at this width. Duplicating the attributes here
 * would leave the tour spotlighting an invisible element.
 */
function BottomNav({ path }: { path: string }) {
  return (
    <nav
      aria-label="Primary"
      className="min-[900px]:hidden fixed bottom-0 inset-x-0 z-30 flex border-t border-line glass-panel pb-[env(safe-area-inset-bottom)]"
    >
      {BOTTOM_NAV.map((n) => {
        const active = isActive(n.href, path);
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? 'page' : undefined}
            className="focus-ring flex-1 min-w-0 flex flex-col items-center gap-1 pt-2 pb-2.5 text-[10.5px] font-medium"
          >
            {/* Material's pill indicator: the shape carries the active state, so
                it survives being read at a glance in bright light. */}
            <span
              className={clsx(
                'px-4 py-0.5 rounded-full transition-colors duration-150',
                active ? 'bg-accent-soft text-accent' : 'text-muted',
              )}
            >
              <Icon size={19} strokeWidth={active ? 2.2 : 1.9} />
            </span>
            <span className={clsx('truncate max-w-full', active ? 'text-accent font-semibold' : 'text-muted')}>
              {n.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function ProfileMenu() {
  const profiles = useApp((s) => s.profiles);
  const activeId = useApp((s) => s.activeProfileId);
  const setActive = useApp((s) => s.setActiveProfile);
  const [open, setOpen] = useState(false);
  const active = profiles.find((p) => p.id === activeId);
  const initial = (active?.name ?? 'P').charAt(0).toUpperCase();

  return (
    <div className="relative shrink-0">
      <button
        data-tour="profile"
        onClick={() => setOpen((o) => !o)}
        aria-label="Profile menu"
        className="focus-ring w-8 h-8 grid place-items-center rounded-full text-[12px] font-bold bg-accent text-[var(--primary-fg)]"
      >
        {initial}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-60 z-50 card p-1.5 shadow-[var(--shadow-2)]">
            <p className="eyebrow px-2.5 pt-1.5 pb-1">Profiles</p>
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => { void setActive(p.id); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] hover:bg-fill text-left transition-colors"
              >
                <span className="w-7 h-7 grid place-items-center rounded-full bg-fill text-ink text-[12px] font-semibold shrink-0">
                  {p.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-medium truncate">{p.name}</span>
                  <span className="block text-[11px] text-muted">{KIND_LABEL[p.kind] ?? p.kind}</span>
                </span>
                {p.id === activeId && <Check size={15} className="text-success shrink-0" />}
              </button>
            ))}
            <div className="my-1 border-t border-line" />
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-2.5 py-2 rounded-[10px] text-[13px] font-medium text-ink-soft hover:bg-fill transition-colors"
            >
              <Plus size={15} /> Manage profiles
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Command-row actions.

   Each of these does a real thing. The design brief also asked for a global
   "date range" control and a "sync portfolio" button; both were dropped rather
   than shipped inert. The date range belongs to the screen being filtered —
   Dashboard, Analytics and Reports each own one — and "sync" has no meaning in
   an app with no server, where the honest equivalent is the encrypted backup
   that Export produces.
   -------------------------------------------------------------------------- */

/**
 * Index level and session state, for the sidebar.
 *
 * The session (open / pre-open / closed) and the clock are real — arithmetic on
 * the current time in IST, no network. The index LEVEL is synthesised, so the
 * card is badged; with demo data switched off it shows the session only, which
 * is still true.
 */
function MarketStatusCard() {
  const [demo] = useDemoData();
  const [state, setState] = useState(() => marketState());
  useEffect(() => {
    const id = setInterval(() => setState(marketState()), 60_000);
    return () => clearInterval(id);
  }, []);

  const nifty = demo ? demoIndices()[0] : null;
  const series = useMemo(
    () => (nifty ? demoSeries('NIFTY50', '1D', nifty.level) : []),
    [nifty],
  );
  const open = state.phase === 'open';

  return (
    <div className="rounded-panel border border-line bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="eyebrow">Market status</span>
        <span className="ml-auto text-[10px] font-semibold text-muted">NSE</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className={clsx('w-1.5 h-1.5 rounded-full', open ? 'bg-success' : 'bg-muted')} />
        <span className={clsx('text-[11.5px] font-semibold', open ? 'text-success' : 'text-muted')}>
          {open ? 'Open' : state.phase === 'pre-open' ? 'Pre-open' : 'Closed'}
        </span>
        <span className="ml-auto text-[10.5px] text-muted tnum">{state.clock}</span>
      </div>
      {nifty ? (
        <>
          <div className="mt-2 text-[17px] font-bold tracking-[-0.03em] tnum">
            {nifty.level.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={clsx('text-[11px] font-semibold tnum', nifty.changePct >= 0 ? 'text-success' : 'text-danger')}>
            {nifty.changePct >= 0 ? '+' : '−'}{Math.abs(nifty.changePct).toFixed(2)}%
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <MiniSparkline values={series} width={110} height={30}
              color={nifty.changePct >= 0 ? 'var(--success)' : 'var(--danger)'} />
            <DemoBadge label="Demo" />
          </div>
        </>
      ) : (
        <p className="mt-2 text-[11px] text-muted leading-relaxed">
          Index levels need a price feed. Session state is from the clock.
        </p>
      )}
    </div>
  );
}

/** Re-reads the vault from IndexedDB and records today's net-worth snapshot. */
function RefreshButton() {
  const reload = useApp((s) => s.reload);
  const captureSnapshot = useApp((s) => s.captureSnapshot);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await reload();
      await captureSnapshot();
    } finally {
      // Hold the spinner briefly even on a fast reload, so the click has a
      // visible result rather than appearing to do nothing.
      setTimeout(() => setBusy(false), 450);
    }
  };

  return (
    <IconBtn
      label={busy ? 'Refreshing…' : 'Refresh — reload the vault and record today\u2019s snapshot'}
      onClick={() => void run()}
      className="hidden min-[1180px]:grid"
    >
      <RefreshCw size={17} className={busy ? 'animate-spin' : undefined} />
    </IconBtn>
  );
}

/** Downloads the encrypted .ftos backup — the same file Settings produces. */
function ExportButton() {
  const exportBackup = useApp((s) => s.exportBackup);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const b64 = await exportBackup();
      const url = URL.createObjectURL(new Blob([b64], { type: 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `khazana-backup-${new Date().toISOString().slice(0, 10)}.ftos`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <IconBtn label="Export an encrypted backup" onClick={() => void run()} className="hidden min-[1180px]:grid">
      <Download size={17} className={busy ? 'opacity-40' : undefined} />
    </IconBtn>
  );
}

/**
 * Notifications.
 *
 * Everything listed is derived from records already in the vault — alerts whose
 * condition holds, bills due inside a week, policies renewing inside a month.
 * Nothing is pushed and nothing is fetched; the badge only appears when there
 * is genuinely something to see.
 */
function NotificationsMenu() {
  const alerts = useApp((s) => s.alerts);
  const holdings = useApp((s) => s.holdings);
  const recurring = useApp((s) => s.recurring);
  const insurances = useApp((s) => s.insurances);
  const [open, setOpen] = useState(false);
  const now = useNow();

  const items = useMemo(() => {
    const out: { id: string; icon: 'alert' | 'bill' | 'policy'; title: string; sub: string; href: string }[] = [];
    if (!now) return out;
    const DAY = 86_400_000;

    const priceOf = new Map(holdings.map((h) => [h.symbol, Number(h.lastPrice ?? h.avgCost)]));
    for (const a of alerts) {
      if (!a.active || !a.symbol) continue;
      const price = priceOf.get(a.symbol);
      if (price == null) continue;
      const t = Number(a.threshold);
      const hit = (a.kind === 'price_above' && price > t) || (a.kind === 'price_below' && price < t);
      if (hit) out.push({ id: `a-${a.id}`, icon: 'alert', title: a.label, sub: 'Condition met', href: '/alerts' });
    }
    for (const b of recurring) {
      const days = Math.ceil((b.nextRun - now) / DAY);
      if (days <= 7) {
        out.push({
          id: `b-${b.id}`,
          icon: 'bill',
          title: b.merchant || 'Scheduled payment',
          sub: days <= 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`,
          href: '/recurring',
        });
      }
    }
    for (const p of insurances) {
      if (p.renewalDate == null) continue;
      const days = Math.ceil((p.renewalDate - now) / DAY);
      if (days <= 30) {
        out.push({
          id: `p-${p.id}`,
          icon: 'policy',
          title: `${p.name} renews`,
          sub: days <= 0 ? 'Overdue' : `In ${days} day${days === 1 ? '' : 's'}`,
          href: '/insurance',
        });
      }
    }
    return out;
  }, [alerts, holdings, recurring, insurances, now]);

  const ICONS = { alert: BellRing, bill: CreditCard, policy: ShieldAlert } as const;

  return (
    <div className="relative shrink-0">
      <IconBtn label={`Notifications${items.length ? ` (${items.length})` : ''}`} onClick={() => setOpen((o) => !o)} className="relative">
        <Bell size={18} />
        {items.length > 0 && (
          <span className="absolute top-1.5 right-2 w-[7px] h-[7px] rounded-full bg-danger ring-2 ring-[var(--canvas)]" />
        )}
      </IconBtn>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-[320px] z-50 card overflow-hidden shadow-[var(--shadow-2)]">
            <div className="px-4 py-3 border-b border-line flex items-center gap-2">
              <p className="eyebrow">Notifications</p>
              {items.length > 0 && <span className="ml-auto text-[11px] font-semibold text-muted">{items.length}</span>}
            </div>
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Inbox size={22} className="mx-auto text-muted mb-2.5" />
                <p className="text-[13px] font-medium">Nothing needs attention</p>
                <p className="text-[11.5px] text-muted mt-1 leading-relaxed">
                  Triggered alerts, bills due this week and renewals due this month show up here.
                </p>
              </div>
            ) : (
              <div className="max-h-[340px] overflow-y-auto">
                {items.slice(0, 8).map((n) => {
                  const Icon = ICONS[n.icon];
                  return (
                    <Link
                      key={n.id}
                      href={n.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-0 hover:bg-fill transition-colors"
                    >
                      <span className={clsx(
                        'w-8 h-8 shrink-0 rounded-[10px] grid place-items-center',
                        n.icon === 'alert' ? 'bg-danger-soft text-danger' : n.icon === 'bill' ? 'bg-warning-soft text-warning' : 'bg-accent-soft text-accent',
                      )}>
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium truncate">{n.title}</span>
                        <span className="block text-[11.5px] text-muted">{n.sub}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ThemeToggle() {
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const order: ThemeChoice[] = ['light', 'dark', 'system'];
  const next = () => setTheme(order[(order.indexOf(theme) + 1) % order.length]);
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return (
    <IconBtn data-tour="theme" onClick={next} label={`Theme: ${theme} (click to change)`}>
      <Icon size={17} />
    </IconBtn>
  );
}
