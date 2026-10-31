'use client';
/**
 * The app shell both web apps wear: sidebar (grouped nav, collapsible rail), top
 * bar, phone drawer and bottom dock, page transitions, command palette.
 *
 * Everything here is layout and navigation. What differs between the apps (the
 * brand artwork, the top-bar actions, a lock button or a sync pill, the account
 * menu, the tour) comes in through `ShellFrame`'s props, so the offline vault
 * and Khazana Online render the same chrome.
 */
import { createContext, useContext, useEffect, useId, useMemo, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  Eye, EyeOff, Menu, X, Plus, ChevronDown, Check, Search,
  Sun, Moon, Monitor, PanelLeft, User, Users, Briefcase, Settings, Hand,
} from 'lucide-react';
import type { ProfileKind } from '@khazana/domain/types';
import { useApp, type ThemeChoice } from '../store';
import { marketState } from '../lib/marketClock';
import { lsGet, lsSet } from '../lib/prefs';
import { demoIndices, demoSeries } from '../lib/demo/marketFeed';
import { MiniSparkline } from '@khazana/ui/charts/MiniSparkline';
import { useDemoData } from './DemoBadge';
import { NAV_GROUPS, BOTTOM_NAV, TITLES, isActive, type NavGroup } from './navConfig';
import { isPendingCapture } from '../lib/capture';
import { CommandPalette } from './CommandPalette';
import { motion, PageTransition, SPRING, tap } from '@khazana/ui/motion';

/** What an app plugs into the shared shell. */
export interface ShellConfig {
  /** The product name, used when a route has no title. */
  appName: string;
  /** The brand artwork: the mark image and the wordmark. */
  Mark: ComponentType<{ size: number; className?: string; decorative?: boolean }>;
  Word: ComponentType<{ className?: string }>;
  /** The line beside the green dot at the foot of the sidebar. */
  footerNote: string;
  /** Sidebar groups. Defaults to the shared `NAV_GROUPS`. */
  navGroups?: NavGroup[];
  /** Page titles by route prefix. Defaults to the shared `TITLES`. */
  titles?: Record<string, string>;
  /** Top-bar controls between the market pill and the theme toggle. */
  actions?: ReactNode;
  /** Top-bar controls after the privacy (ghost) toggle, before the profile menu. */
  end?: ReactNode;
  /** Extra rows at the foot of the profile menu; call `close` to dismiss it. */
  profileMenuExtra?: (close: () => void) => ReactNode;
  /** Rendered once inside the shell, e.g. the guided tour. */
  overlays?: ReactNode;
}

const Cfg = createContext<ShellConfig | null>(null);
function useCfg(): ShellConfig {
  const c = useContext(Cfg);
  if (!c) throw new Error('Shell parts must render inside <ShellFrame>.');
  return c;
}

const KIND_LABEL: Record<string, string> = { self: 'Personal', spouse: 'Spouse', business: 'Business' };
const RAIL_KEY = 'khazana-nav-collapsed';

// A tiny external store for the rail preference. Browser storage has no change
// event for same-tab writes, so subscribers are notified by hand.
const railListeners = new Set<() => void>();
function subscribeRail(fn: () => void) {
  railListeners.add(fn);
  return () => { railListeners.delete(fn); };
}
function readRail(): boolean {
  try { return lsGet(RAIL_KEY) === '1'; } catch { return false; }
}

export function ShellFrame({ children, ...config }: { children: ReactNode } & ShellConfig) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  // `useSyncExternalStore` rather than an effect: it reads the stored value
  // during render on the client while still returning the server snapshot for
  // hydration, so there is no setState-in-effect cascade and no theme flash.
  const rail = useSyncExternalStore(subscribeRail, () => readRail(), () => false);
  const toggleRail = () => {
    const next = !rail;
    lsSet(RAIL_KEY, next ? '1' : '0');
    railListeners.forEach((fn) => fn());
  };

  const titles = config.titles ?? TITLES;
  const title = titles[Object.keys(titles).find((k) => path.startsWith(k)) ?? '/dashboard'] ?? config.appName;

  return (
    <Cfg.Provider value={config}>
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
            className="absolute left-0 top-0 h-full w-[280px] bg-[var(--card-2)] border-r border-line flex flex-col overflow-y-auto"
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
        <TopBar title={title} home={path.startsWith('/dashboard')} onMenu={() => setDrawer(true)} onRail={toggleRail} />
        {/* Bottom padding clears the floating bar (and its raised +) below 900px. */}
        <main className="flex-1 px-4 min-[900px]:px-8 py-6 pb-32 min-[900px]:pb-10">
          <div className="mx-auto max-w-[1560px]">
            <PageTransition routeKey={path}>{children}</PageTransition>
          </div>
        </main>
      </div>

      <BottomNav path={path} />
      <CommandPalette navGroups={config.navGroups} />
      {config.overlays}
    </div>
    </Cfg.Provider>
  );
}

/* -------------------------------------------------------------------------- */

/** Time-of-day greeting for the phone home screen. */
function greeting(hour: number): string {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The phone home header: who this book belongs to, said warmly. Replaces the
 * bare page title on the dashboard only; every other screen keeps its title.
 */
function Greeting() {
  const profiles = useApp((s) => s.profiles);
  const activeId = useApp((s) => s.activeProfileId);
  const name = profiles.find((p) => p.id === activeId)?.name;
  // Read once on mount: a greeting that flips mid-session is noise. Computed in
  // an effect so the static-export HTML never bakes in the build machine's hour.
  const [hello, setHello] = useState('Hello');
  useEffect(() => {
    const id = requestAnimationFrame(() => setHello(greeting(new Date().getHours())));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <span className="min-[900px]:hidden min-w-0 leading-tight">
      <span className="block fs-11.5 text-muted">{hello},</span>
      <span className="block font-semibold tracking-tight truncate">
        {name ?? 'there'} <Hand size={15} aria-hidden className="inline -mt-0.5 ml-0.5 text-gold" />
      </span>
    </span>
  );
}

function TopBar({ title, home, onMenu, onRail }: { title: string; home: boolean; onMenu: () => void; onRail: () => void }) {
  const ghost = useApp((s) => s.ghost);
  const toggleGhost = useApp((s) => s.toggleGhost);
  const cfg = useCfg();

  return (
    <header className={clsx('sticky top-0 z-30 flex items-center gap-2 px-4 min-[900px]:px-8 h-16 border-b border-line glass-panel', home && 'topbar-home')}>
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

      {home ? <Greeting /> : <span className="min-[900px]:hidden font-semibold tracking-tight truncate">{title}</span>}

      <PortfolioSelector />
      <SearchButton />

      <span className="flex-1" />

      <MarketPill />

      {cfg.actions}

      <ThemeToggle />

      <IconBtn label="Privacy (Ghost mode)" data-tour="ghost" onClick={toggleGhost}>
        {ghost ? <EyeOff size={17} /> : <Eye size={17} />}
      </IconBtn>
      {cfg.end}

      <ProfileMenu />
    </header>
  );
}

export function IconBtn({
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
        'rounded-btn border border-line bg-card text-muted fs-13',
        'hover:border-line-strong transition-colors duration-150',
      )}
    >
      <Search size={15} className="shrink-0" />
      <span className="truncate">Search holdings, transactions, reports…</span>
      <kbd className="ml-auto shrink-0 fs-10.5 font-semibold px-1.5 py-0.5 rounded-[var(--radius-btn)] bg-fill-strong border border-line">⌘K</kbd>
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
        'hidden min-[720px]:inline-flex items-center gap-2 h-8 px-3 rounded-full fs-11.5 font-semibold whitespace-nowrap',
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

/** The profile's photo when it has one, otherwise its kind mark. Fills a round parent. */
function ProfileFace({ profile, size = 15 }: { profile?: { kind?: ProfileKind; photo?: string | null }; size?: number }) {
  if (profile?.photo) {
    // eslint-disable-next-line @next/next/no-img-element -- a data URL from the vault; next/image cannot optimise it
    return <img src={profile.photo} alt="" className="w-full h-full rounded-full object-cover" />;
  }
  return <ProfileMark kind={profile?.kind} size={size} />;
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
      <span className="w-[26px] h-[26px] grid place-items-center rounded-full bg-primary text-[var(--primary-fg)] overflow-hidden">
        <ProfileFace profile={active} size={14} />
      </span>
      <span className="hidden min-[1024px]:block min-w-0 text-left">
        <span className="block fs-13 font-semibold leading-tight truncate max-w-[130px]">{active?.name ?? 'Portfolio'}</span>
        <span className="block fs-10.5 text-muted leading-tight">{KIND_LABEL[active?.kind ?? 'self']}</span>
      </span>
      <ChevronDown size={14} className="text-muted shrink-0" />
    </Link>
  );
}

function Brand({ rail }: { rail: boolean }) {
  const { Mark, Word } = useCfg();
  return (
    <Link href="/dashboard" className={clsx('flex items-center gap-3 px-5 pt-[18px] pb-4', rail && 'justify-center px-0')}>
      <Mark size={34} className="shrink-0" decorative={!rail} />
      {/* Wordmark only. The full lockup carries the tagline under it, but at
          248px "Your wealth. Your vault." wraps to two lines and eats a nav
          row — so the tagline lives on the vault gate, where it has room. */}
      {!rail && <Word className="min-w-0 truncate fs-15 leading-tight text-ink" />}
    </Link>
  );
}

function Nav({
  path, rail, className, onNavigate,
}: { path: string; rail: boolean; className?: string; onNavigate?: () => void }) {
  // Per-instance, so the sidebar and the drawer never animate a pill between them.
  const pillId = useId();
  const toReview = useApp((s) => s.pendingCaptures.filter(isPendingCapture).length);
  const groups = useCfg().navGroups ?? NAV_GROUPS;
  return (
    <nav data-tour="nav" className={className}>
      {groups.map((group, gi) => (
        <div key={group.label} className={gi > 0 ? 'mt-3.5' : undefined}>
          {rail ? (
            gi > 0 && <div className="mx-2.5 mb-2 h-px bg-line" />
          ) : (
            <p className="px-2.5 pb-1.5 fs-12 font-normal text-muted leading-snug">
              {group.label}
            </p>
          )}
          {group.items.map((n) => {
            const active = isActive(n.href, path);
            const Icon = n.icon;
            const badge = n.href === '/capture' ? (toReview || undefined) : n.badge;
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                data-tour={`nav-${n.href.replace('/', '')}`}
                title={rail ? n.label : undefined}
                className={clsx(
                  'group/nav relative flex items-center gap-3 rounded-[12px] mb-0.5 fs-13.5 leading-[1.45]',
                  'transition-colors duration-150 ease-standard',
                  rail ? 'justify-center p-2.5' : 'px-2.5 py-1.5',
                  // Vault: #12352A on #20C98A. Ledger: #E1F3EB on #087A56.
                  // Both come straight from --accent-soft / --accent.
                  // Zentra: the active row is the near-black pill.
                  active
                    ? 'text-[var(--primary-fg)] font-medium'
                    : 'text-ink-soft font-normal hover:bg-fill hover:text-ink',
                )}
              >
                {/* The active pill slides from the old row to the new one. */}
                {active && (
                  <motion.span
                    layoutId={pillId}
                    transition={SPRING}
                    aria-hidden
                    className="absolute inset-0 rounded-[12px] bg-primary shadow-[0_6px_14px_-8px_rgba(0,0,0,0.5)]"
                  />
                )}
                <Icon size={17.5} strokeWidth={active ? 2.2 : 1.9} className="relative shrink-0" />
                {!rail && <span className="relative truncate">{n.label}</span>}
                {!rail && badge != null && (
                  <span className="relative ml-auto fs-10 font-semibold px-1.5 rounded-full bg-danger text-white">{badge}</span>
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
                      className="pointer-events-none absolute left-full top-1/2 z-40 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-btn)] border border-line bg-card px-2.5 py-1.5 fs-12 font-medium text-ink-soft shadow-lg group-hover/nav:block group-focus-visible/nav:block"
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
  const { footerNote } = useCfg();
  return (
    <div className="p-3 border-t border-line grid gap-2.5">
      {!rail && <MarketStatusCard />}
      <Link
        href="/add"
        data-tour="add"
        title="New transaction"
        className={clsx(
          'focus-ring flex items-center justify-center gap-2 rounded-btn h-10',
          'bg-primary text-primary-fg fs-13 font-semibold',
          'shadow-[0_2px_10px_-3px_color-mix(in_srgb,var(--primary)_75%,transparent)]',
          'hover:shadow-[var(--glow)] transition-shadow duration-[250ms] ease-standard',
        )}
      >
        <Plus size={17} />
        {!rail && 'New Transaction'}
      </Link>
      <p className={clsx('flex items-center gap-2 px-1 fs-11 text-muted', rail && 'justify-center')}>
        <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_0_3px_var(--success-soft)] shrink-0" />
        {!rail && <span>{footerNote}</span>}
      </p>
    </div>
  );
}

/**
 * Phone bottom bar: a floating, rounded dock of the four Flutter tabs with a
 * raised + in the middle.
 *
 * The + is deliberately OUTSIDE the `<nav>`: the four links inside it are the
 * Flutter tab bar and `Shell.test.tsx` holds them to exactly that list. A
 * spacer at the bar's centre leaves room for the button, which sits over it.
 *
 * Carries no `data-tour` attributes on purpose: `Tour.tsx` finds its targets
 * with `querySelector`, which returns the first match in DOM order — the
 * sidebar copy, which is `hidden` at this width. Duplicating the attributes here
 * would leave the tour spotlighting an invisible element.
 */
function BottomNav({ path }: { path: string }) {
  const pillId = useId();
  // Two equal halves around a centre slot, so the + sits dead centre:
  // 2 | + | 2 with four tabs.
  const split = Math.floor(BOTTOM_NAV.length / 2);
  const tab = (n: (typeof BOTTOM_NAV)[number]) => {
    const active = isActive(n.href, path);
    const Icon = n.icon;
    return (
      <Link
        key={n.href}
        href={n.href}
        aria-current={active ? 'page' : undefined}
        className="focus-ring relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 fs-10.5 font-medium rounded-[22px]"
      >
        <span className="relative grid place-items-center w-12 h-8">
          {active && (
            <motion.span
              layoutId={pillId}
              transition={SPRING}
              aria-hidden
              className="absolute inset-0 rounded-full bg-[var(--home-pill)] shadow-[0_6px_14px_-6px_rgba(0,0,0,0.45)]"
            />
          )}
          <Icon
            size={19}
            strokeWidth={active ? 2.2 : 1.9}
            className={clsx('relative transition-colors duration-150', active ? 'text-[var(--home-pill-ink)]' : 'text-muted')}
          />
        </span>
        <span className={clsx('truncate max-w-full', active ? 'text-ink font-semibold' : 'text-muted')}>
          {n.short ? <><span aria-hidden>{n.short}</span><span className="sr-only">{n.label}</span></> : n.label}
        </span>
      </Link>
    );
  };
  return (
    <div className="min-[900px]:hidden fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pointer-events-none">
      <div className="relative mx-auto max-w-[480px] pointer-events-auto">
        <nav
          aria-label="Primary"
          className="flex items-stretch h-[64px] px-1 rounded-[28px] bg-[var(--card-2)] shadow-[0_16px_30px_-14px_rgba(0,0,0,0.35)]"
        >
          <div className="flex flex-1 min-w-0">{BOTTOM_NAV.slice(0, split).map(tab)}</div>
          <span aria-hidden className="w-[72px] shrink-0" />
          <div className="flex flex-1 min-w-0">{BOTTOM_NAV.slice(split).map(tab)}</div>
        </nav>
        <motion.div
          {...tap}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute left-1/2 -top-5 -translate-x-1/2"
        >
          <Link
            href="/add"
            aria-label="New transaction"
            className="focus-ring grid place-items-center w-[60px] h-[60px] rounded-full bg-[var(--home-pill)] text-[var(--home-pill-ink)] shadow-[0_12px_26px_-10px_rgba(0,0,0,0.55)] ring-4 ring-[var(--canvas)]"
          >
            <Plus size={26} strokeWidth={2.4} />
          </Link>
        </motion.div>
      </div>
    </div>
  );
}

function ProfileMenu() {
  const cfg = useCfg();
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
        // The same 36px slot as the icon buttons beside it, so the avatar sits
        // on their centre line; the face itself is 30px inside it.
        className="focus-ring w-9 h-9 grid place-items-center rounded-full"
      >
        <span
          className={clsx(
            'w-[30px] h-[30px] grid place-items-center rounded-full overflow-hidden',
            // A photo gets a hairline edge instead of the accent disc, which
            // showed as a pale fringe around it in dark mode.
            active?.photo ? 'ring-1 ring-[var(--line-strong)]' : 'bg-accent text-[var(--primary-fg)]',
          )}
        >
          <ProfileFace profile={active} />
        </span>
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
                <span className="w-7 h-7 grid place-items-center rounded-full bg-fill text-ink-soft shrink-0 overflow-hidden">
                  <ProfileFace profile={p} size={14} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block fs-13.5 font-medium truncate">{p.name}</span>
                  <span className="block fs-11 text-muted">{KIND_LABEL[p.kind] ?? p.kind}</span>
                </span>
                {p.id === activeId && <Check size={15} className="text-success shrink-0" />}
              </button>
            ))}
            <div className="my-1 border-t border-line" />
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-card)] fs-13 font-medium text-ink-soft hover:bg-fill transition-colors"
            >
              <Plus size={15} /> Manage profiles
            </Link>
            {/* Settings lives here and in the menu, not in the bottom bar —
                the same place the Flutter app keeps it, behind the avatar. */}
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-card)] fs-13 font-medium text-ink-soft hover:bg-fill transition-colors"
            >
              <Settings size={15} /> Settings
            </Link>
            {cfg.profileMenuExtra?.(() => setOpen(false))}
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
        <span className="ml-auto fs-10 font-semibold text-muted">NSE</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className={clsx('w-1.5 h-1.5 rounded-full', open ? 'bg-success' : 'bg-muted')} />
        <span className={clsx('fs-11.5 font-semibold', open ? 'text-success' : 'text-muted')}>
          {open ? 'Open' : state.phase === 'pre-open' ? 'Pre-open' : 'Closed'}
        </span>
        <span className="ml-auto fs-10.5 text-muted tnum">{state.clock}</span>
      </div>
      {nifty ? (
        <>
          <div className="mt-2 fs-18 font-light tracking-[-0.02em] tnum">
            {nifty.level.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={clsx('fs-11 font-semibold tnum', nifty.changePct >= 0 ? 'text-success' : 'text-danger')}>
            {nifty.changePct >= 0 ? '+' : '−'}{Math.abs(nifty.changePct).toFixed(2)}%
          </div>
          <MiniSparkline values={series} width={110} height={30}
            color={nifty.changePct >= 0 ? 'var(--success)' : 'var(--danger)'} />
          {/* One quiet line, not a badge. A `DEMO` chip sitting inside
              production chrome tells the user they are looking at a prototype;
              the honest thing is to label the data once, in the widget that
              carries it, in the same voice as everything else. */}
          <div className="mt-1 fs-10.5 text-muted">Sample index data</div>
        </>
      ) : (
        <p className="mt-2 fs-11 text-muted leading-relaxed">
          Index levels need a price feed. Session state is from the clock.
        </p>
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
