'use client';
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  Eye, EyeOff, Lock, Menu, X, Plus, ChevronDown, Check, Search,
  Sun, Moon, Monitor, PanelLeft, Bell, RefreshCw, Download,
  CreditCard, ShieldAlert, BellRing, Inbox, History,
  User, Users, Briefcase,
} from 'lucide-react';
import { APP_NAME } from '@/lib/brand';
import { useApp, type ThemeChoice } from '@/lib/store';
import type { ProfileKind } from '@/lib/types';
import { evaluateAlerts, triggered } from '@/domain/alerts';
import { marketState } from '@/lib/marketClock';
import { useNow } from '@/lib/useNow';
import { useNotificationDriver } from '@/lib/useNotificationDriver';
import { demoIndices, demoSeries } from '@/lib/demo/marketFeed';
import { MiniSparkline } from './charts/MiniSparkline';
import { BrandMark, WordMark } from './BrandMark';
import { useDemoData } from './DemoBadge';
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
              <button onClick={() => setDrawer(false)} className="focus-ring text-ink-soft p-2 rounded-[var(--radius-btn)]" aria-label="Close navigation">
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
        className="min-[900px]:hidden focus-ring w-9 h-9 grid place-items-center rounded-[var(--radius-card)] text-ink-soft hover:bg-fill"
        onClick={onMenu}
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>
      <button
        className="hidden min-[900px]:grid focus-ring w-9 h-9 place-items-center rounded-[var(--radius-card)] text-ink-soft hover:bg-fill hover:text-ink transition-colors"
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
        'focus-ring w-9 h-9 shrink-0 grid place-items-center rounded-[var(--radius-card)] text-ink-soft',
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
      <kbd className="ml-auto shrink-0 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-[var(--radius-btn)] bg-fill-strong border border-line">⌘K</kbd>
    </button>
  );
}

/**
 * Market session in the topbar — the fallback for when the sidebar's fuller
 * [MarketStatusCard] is not on screen.
 *
 * Exactly one of the two shows at any width. They used to both render on an
 * expanded desktop sidebar, putting "NSE Closed · 18:51" twice on the same
 * screen — which is what made the market feel like the app's headline concern
 * rather than a status line. The sidebar appears at 900px and the card only
 * when it is expanded, so this pill stands down precisely there.
 */
function MarketPill() {
  // Ticks once a minute so the clock stays honest without a render storm.
  const [state, setState] = useState(() => marketState());
  useEffect(() => {
    const id = setInterval(() => setState(marketState()), 60_000);
    return () => clearInterval(id);
  }, []);
  const rail = useSyncExternalStore(subscribeRail, () => readRail(), () => false);
  const open = state.phase === 'open';
  const pre = state.phase === 'pre-open';
  return (
    <span
      className={clsx(
        'hidden min-[720px]:inline-flex items-center gap-2 h-8 px-3 rounded-full text-[11.5px] font-semibold whitespace-nowrap',
        // The expanded sidebar carries the card; do not say it twice.
        !rail && 'min-[900px]:hidden',
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

/**
 * A profile's mark: the kind of profile it is, not the first letter of its name.
 *
 * `P`, `S`, `B` in a circle is the address-book avatar again — the same idiom
 * that made the ticker tiles and the broker chips read as template. A profile
 * is not a person you are contacting; it is a *book of accounts*, and which
 * kind it is (your own, a spouse's, a business') is the one thing worth showing
 * at a glance. An initial cannot distinguish two profiles both called "Personal
 * savings"; the kind can.
 */
const PROFILE_ICON = { self: User, spouse: Users, business: Briefcase } as const;

function ProfileMark({ kind, size = 15 }: { kind?: ProfileKind; size?: number }) {
  const Icon = PROFILE_ICON[kind ?? 'self'] ?? User;
  return <Icon size={size} strokeWidth={1.75} aria-hidden />;
}

function PortfolioSelector() {
  const profiles = useApp((s) => s.profiles);
  const activeId = useApp((s) => s.activeProfileId);
  const active = profiles.find((p) => p.id === activeId);
  return (
    <Link
      href="/settings"
      className={clsx(
        'hidden min-[720px]:flex focus-ring items-center gap-2.5 h-9 pl-1.5 pr-2.5 shrink-0',
        'rounded-btn border border-line bg-card hover:border-line-strong transition-colors duration-150',
      )}
      title="Switch portfolio"
    >
      <span className="w-[26px] h-[26px] grid place-items-center rounded-[var(--radius-btn)] bg-accent-soft text-accent ring-1 ring-inset ring-accent-line">
        <ProfileMark kind={active?.kind} size={14} />
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
  const isPro = useApp((s) => s.pro.isPro);
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
                  'group/nav relative flex items-center gap-3 rounded-[var(--radius-card)] mb-0.5 text-[13.5px] leading-[1.45]',
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
                {/* A quiet lock, not a hard stop. The row still navigates —
                    the screen renders the real content blurred behind the
                    paywall — because hiding gated rows would make the sidebar
                    change shape on purchase, and would stop anyone discovering
                    what they are being sold. */}
                {!rail && n.pro && !isPro && n.badge == null && (
                  <span className="ml-auto rounded-full bg-accent-soft px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-[0.08em] text-accent">
                    Pro
                  </span>
                )}
                {/* Always in the accessible name, so a screen reader hears
                    "Portfolio, allocation returns performance" and never has to
                    guess how it differs from "Holdings". Shown to sighted users
                    on hover or keyboard focus, positioned rather than inlined:
                    twenty-five two-line rows would not fit, and reserving the
                    space only on hover would make the list jump. */}
                {n.description && (
                  <>
                    <span className="sr-only">. {n.description}</span>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-full top-1/2 z-40 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-btn)] border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-ink-soft shadow-lg group-hover/nav:block group-focus-visible/nav:block"
                    >
                      {n.description}
                    </span>
                  </>
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
  return (
    <div className="relative shrink-0">
      <button
        data-tour="profile"
        onClick={() => setOpen((o) => !o)}
        aria-label="Profile menu"
        className="focus-ring w-8 h-8 grid place-items-center rounded-full bg-accent text-[var(--primary-fg)]"
      >
        <ProfileMark kind={active?.kind} />
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
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-card)] hover:bg-fill text-left transition-colors"
              >
                <span className="w-7 h-7 grid place-items-center rounded-full bg-fill text-ink-soft shrink-0">
                  <ProfileMark kind={p.kind} size={14} />
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
              className="flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-card)] text-[13px] font-medium text-ink-soft hover:bg-fill transition-colors"
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
          <MiniSparkline values={series} width={110} height={30}
            color={nifty.changePct >= 0 ? 'var(--success)' : 'var(--danger)'} />
          {/* One quiet line, not a badge. A `DEMO` chip sitting inside
              production chrome tells the user they are looking at a prototype;
              the honest thing is to label the data once, in the widget that
              carries it, in the same voice as everything else. */}
          <div className="mt-1 text-[10.5px] text-muted">Sample index data</div>
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
  const budgets = useApp((s) => s.budgets);
  const categories = useApp((s) => s.categories);
  const txns = useApp((s) => s.txns);
  const [open, setOpen] = useState(false);
  const now = useNow();
  // Reminders whose moment passed while Khazana was closed. On mobile the OS
  // would have delivered these; here there is no scheduler and no push, so the
  // next visit is the only chance they get to be said at all.
  const { plan, acknowledgeMissed } = useNotificationDriver();

  const items = useMemo(() => {
    const out: { id: string; icon: 'alert' | 'bill' | 'policy' | 'missed'; title: string; sub: string; href: string }[] = [];
    if (!now) return out;
    const DAY = 86_400_000;

    for (const m of plan.missed) {
      out.push({
        id: `m-${m.dedupeKey}`,
        icon: 'missed',
        title: m.title,
        sub: `While you were away — ${m.body}`,
        href: m.deepLink ?? '/dashboard',
      });
    }

    // The shared evaluator (§5). This menu used to run its own cut-down copy
    // that handled only price_above/price_below, skipped anything without a
    // symbol, and compared with `Number()` — so the bell and the Alerts page
    // could disagree about the very same rule, and a budget or renewal alert
    // never appeared here at all.
    for (const e of triggered(evaluateAlerts({
      alerts, holdings, budgets, categories, txns, insurances, now,
    }))) {
      out.push({ id: `a-${e.alert.id}`, icon: 'alert', title: e.alert.label, sub: e.message, href: '/alerts' });
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
  }, [alerts, holdings, budgets, categories, txns, recurring, insurances, now, plan.missed]);

  const ICONS = { alert: BellRing, bill: CreditCard, policy: ShieldAlert, missed: History } as const;

  return (
    <div className="relative shrink-0">
      <IconBtn
        label={`Notifications${items.length ? ` (${items.length})` : ''}`}
        onClick={() => {
          // Opening the menu *is* the delivery for a missed reminder — there is
          // no other channel it could have arrived through. Marking it here is
          // what stops it being offered again on every visit forever.
          if (!open) acknowledgeMissed();
          setOpen((o) => !o);
        }}
        className="relative"
      >
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
                  Alerts whose condition is met, bills due this week and renewals due this month show
                  up here. Rules are checked while Khazana is open — never in the background. Turn on
                  system notifications in Settings to hear about one the moment it fires.
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
                        'shrink-0 grid place-items-center',
                              n.icon === 'alert' ? 'text-danger'
                          : n.icon === 'bill' ? 'text-warning'
                            : n.icon === 'missed' ? 'text-muted' : 'text-accent',
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
