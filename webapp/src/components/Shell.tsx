'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  LayoutDashboard, Receipt, TrendingUp, CreditCard, BarChart3, PieChart,
  Flag, Repeat, Settings, Eye, EyeOff, Lock, Menu, X, Plus, Shield, ChevronDown, Check,
  Sun, Moon, Monitor, LifeBuoy, CalendarDays, Gauge,
} from 'lucide-react';
import { APP_NAME } from '@/lib/brand';
import { useApp, type ThemeChoice } from '@/lib/store';
import { Tour } from './Tour';

/**
 * The full sidebar. Every route in the app is here — the sidebar is the
 * complete index, and the bottom bar below is a shortcut to five of them, not a
 * replacement for this list.
 */
const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
  { href: '/transactions', icon: Receipt, label: 'Cash Flow' },
  { href: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { href: '/investments', icon: TrendingUp, label: 'Investments' },
  { href: '/score', icon: Gauge, label: 'Score' },
  { href: '/liabilities', icon: CreditCard, label: 'Liabilities' },
  { href: '/insurance', icon: Shield, label: 'Insurance' },
  { href: '/safety-net', icon: LifeBuoy, label: 'Safety Net' },
  { href: '/budget', icon: PieChart, label: 'Budget' },
  { href: '/goals', icon: Flag, label: 'Goals' },
  { href: '/reports', icon: BarChart3, label: 'Reports' },
  { href: '/recurring', icon: Repeat, label: 'Recurring' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

/**
 * The five phone destinations, matching the Flutter app's bottom bar exactly.
 * A user moving between the two clients should not have to relearn where things
 * are; `Shell.test.tsx` asserts the two lists stay in step.
 *
 * Everything not here stays reachable through the hamburger drawer, which is
 * why this can be five items rather than thirteen.
 */
const BOTTOM_NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
  { href: '/transactions', icon: Receipt, label: 'Cash Flow' },
  { href: '/investments', icon: TrendingUp, label: 'Investments' },
  { href: '/score', icon: Gauge, label: 'Score' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

const TITLES: Record<string, string> = {
  '/dashboard': 'Overview', '/transactions': 'Cash Flow', '/investments': 'Investments',
  '/score': 'Score',
  '/liabilities': 'Liabilities', '/insurance': 'Insurance', '/safety-net': 'Safety Net', '/budget': 'Budget', '/goals': 'Goals',
  '/reports': 'Reports', '/recurring': 'Recurring', '/settings': 'Settings', '/add': 'Add Transaction',
};

const KIND_LABEL: Record<string, string> = { self: 'Personal', spouse: 'Spouse', business: 'Business' };

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const ghost = useApp((s) => s.ghost);
  const toggleGhost = useApp((s) => s.toggleGhost);
  const lock = useApp((s) => s.lock);
  const title = TITLES[Object.keys(TITLES).find((k) => path.startsWith(k)) ?? '/dashboard'] ?? APP_NAME;

  return (
    <div className="min-h-screen flex">
      {/* Sidebar. Collapses at 900px rather than Tailwind's 768px `md`: the
          sidebar plus a readable content column needs the extra room, and web
          is served to phones and desktops alike so the breakpoint has to be
          width-driven. Page-level `md:` grids are independent — don't sweep
          them into this. */}
      <aside className="hidden min-[900px]:flex w-[248px] shrink-0 flex-col border-r border-[var(--line)] px-4 py-6">
        <Brand />
        <Nav path={path} className="mt-8 flex-1" />
        <NewTxnButton />
        <p className="mt-4 px-1 text-[11px] text-muted leading-relaxed">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-income align-middle mr-1.5" />
          Private &amp; encrypted on this device
        </p>
      </aside>

      {/* Mobile drawer — the full route index below 900px. */}
      {open && (
        <div className="fixed inset-0 z-40 min-[900px]:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <aside className="absolute left-0 top-0 h-full w-[280px] bg-canvas border-r border-[var(--line)] px-4 py-6 flex flex-col overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><Brand /><button onClick={() => setOpen(false)} className="text-ink-soft"><X size={20} /></button></div>
            <Nav path={path} className="mt-8 flex-1" onNavigate={() => setOpen(false)} />
            <NewTxnButton />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 px-5 min-[900px]:px-10 h-14 border-b border-[var(--line)] bg-[var(--canvas)]/85 backdrop-blur-xl">
          <button className="min-[900px]:hidden text-ink-soft" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <span className="min-[900px]:hidden font-semibold tracking-tight">{title}</span>
          <div className="flex-1" />
          <ThemeToggle />
          <button data-tour="ghost" onClick={toggleGhost} title="Privacy (Ghost mode)" className="focus-ring w-8 h-8 grid place-items-center rounded-full hover:bg-[var(--surface-2)] text-ink-soft transition-colors">
            {ghost ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
          <button onClick={lock} title="Lock vault" className="focus-ring w-8 h-8 grid place-items-center rounded-full hover:bg-[var(--fill)] text-ink-soft transition-colors">
            <Lock size={16} />
          </button>
          <ProfileMenu />
        </header>
        {/* Bottom padding clears the fixed bar below 900px. */}
        <main className="flex-1 px-5 min-[900px]:px-9 py-6 pb-24 min-[900px]:pb-6">
          <div className="mx-auto max-w-[1280px]">{children}</div>
        </main>
      </div>
      <BottomNav path={path} />
      <Tour />
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
      className="min-[900px]:hidden fixed bottom-0 inset-x-0 z-30 flex border-t border-[var(--line)] bg-[var(--canvas)]/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
    >
      {BOTTOM_NAV.map((n) => {
        const active = path === n.href || (n.href !== '/dashboard' && path.startsWith(n.href));
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
                active ? 'bg-[var(--fill-strong)] text-ink' : 'text-muted',
              )}
            >
              <Icon size={19} strokeWidth={active ? 2.2 : 1.9} />
            </span>
            <span className={clsx('truncate max-w-full', active ? 'text-ink font-semibold' : 'text-muted')}>
              {n.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-1">
      <span className="w-8 h-8 rounded-[9px] bg-[var(--primary)] grid place-items-center">
        <span className="w-3 h-3 rounded-[3px] border-[1.5px]" style={{ borderColor: 'var(--primary-fg)', opacity: 0.9 }} />
      </span>
      <span className="font-bold text-[15.5px] tracking-tight">{APP_NAME}</span>
    </Link>
  );
}

function Nav({ path, className, onNavigate }: { path: string; className?: string; onNavigate?: () => void }) {
  return (
    <nav data-tour="nav" className={clsx('space-y-0.5', className)}>
      {NAV.map((n) => {
        const active = path === n.href || (n.href !== '/dashboard' && path.startsWith(n.href));
        const Icon = n.icon;
        return (
          <Link key={n.href} href={n.href} onClick={onNavigate}
            data-tour={`nav-${n.href.replace('/', '')}`}
            className={clsx('flex items-center gap-3 px-3 py-2 rounded-[10px] text-[13.5px] transition-colors duration-150',
              active ? 'bg-[var(--fill)] text-ink font-semibold' : 'text-ink-soft font-medium hover:bg-[var(--fill)] hover:text-ink')}>
            <Icon size={17.5} strokeWidth={active ? 2.2 : 1.9} className={active ? 'text-ink' : 'text-muted'} />
            {n.label}
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
    <div className="relative">
      <button data-tour="profile" onClick={() => setOpen((o) => !o)} className="focus-ring flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1 hover:bg-[var(--fill)] transition-colors">
        <span className="w-7 h-7 grid place-items-center rounded-full bg-[var(--primary)] text-[var(--primary-fg)] text-[12px] font-semibold">{initial}</span>
        <span className="hidden sm:block text-[13px] font-medium max-w-[120px] truncate">{active?.name ?? 'Profile'}</span>
        <ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-60 z-50 card p-1.5">
            <p className="eyebrow px-2.5 pt-1.5 pb-1">Profiles</p>
            {profiles.map((p) => (
              <button key={p.id} onClick={() => { void setActive(p.id); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] hover:bg-[var(--fill)] text-left transition-colors">
                <span className="w-7 h-7 grid place-items-center rounded-full bg-[var(--fill)] text-ink text-[12px] font-semibold shrink-0">{p.name.charAt(0).toUpperCase()}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-medium truncate">{p.name}</span>
                  <span className="block text-[11px] text-muted">{KIND_LABEL[p.kind] ?? p.kind}</span>
                </span>
                {p.id === activeId && <Check size={15} className="text-income shrink-0" />}
              </button>
            ))}
            <div className="my-1 border-t border-[var(--line)]" />
            <Link href="/settings" onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-2.5 py-2 rounded-[10px] text-[13px] font-medium text-ink-soft hover:bg-[var(--fill)] transition-colors">
              <Plus size={15} /> Manage profiles
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function NewTxnButton() {
  return (
    <Link href="/add" data-tour="add"
      className="focus-ring mt-3 flex items-center justify-center gap-2 rounded-[11px] bg-[var(--primary)] text-[var(--primary-fg)] text-[13.5px] font-semibold py-2.5 hover:opacity-90 transition-opacity">
      <Plus size={17} /> Add Transaction
    </Link>
  );
}

function ThemeToggle() {
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const order: ThemeChoice[] = ['light', 'dark', 'system'];
  const next = () => setTheme(order[(order.indexOf(theme) + 1) % order.length]);
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return (
    <button data-tour="theme" onClick={next} title={`Theme: ${theme} (click to change)`}
      className="focus-ring w-8 h-8 grid place-items-center rounded-full hover:bg-[var(--surface-2)] text-ink-soft transition-colors">
      <Icon size={17} />
    </button>
  );
}
