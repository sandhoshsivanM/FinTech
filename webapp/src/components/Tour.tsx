'use client';
// First-run guided tour. Always walks through the SAME 6 steps, one area at a
// time, each explained exactly once. Spotlights the control when it's on screen;
// if a control is tucked away (e.g. the mobile menu), the step still shows its
// explanation centered so nothing is skipped. Auto-runs once for new users;
// replayable via the 'ftos:start-tour' window event. Pure DOM — no deps.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui';

interface Step { sel: string; title: string; body: string }

// Every area of the app, explained once, in nav order.
const STEPS: Step[] = [
  { sel: '[data-tour="networth"]', title: 'Overview', body: 'Your home screen: net worth (what you own minus what you owe), trends, a health score and smart insights. Tap the eye to hide amounts.' },
  { sel: '[data-tour="add"]', title: 'Add a transaction', body: 'Log income or spending here. Tip: quick-add — type “spent 450 on groceries” and it fills the form for you.' },
  { sel: '[data-tour="nav-transactions"]', title: 'Cash Flow', body: 'Every transaction in one list — search, filter by income/expense, edit, delete, and export to CSV.' },
  { sel: '[data-tour="nav-investments"]', title: 'Investments', body: 'Your holdings with allocation, profit/loss, XIRR returns and an unrealised-tax estimate. Import from a broker CSV too.' },
  { sel: '[data-tour="nav-liabilities"]', title: 'Liabilities', body: 'Track loans & credit cards — balances, APR, EMIs, card utilisation, and a debt-payoff planner (avalanche/snowball).' },
  { sel: '[data-tour="nav-insurance"]', title: 'Insurance', body: 'Record your policies and see a coverage-gap analysis — whether your life and health cover are enough.' },
  { sel: '[data-tour="nav-safety-net"]', title: 'Safety Net', body: 'One readiness score that pulls together your emergency fund, insurance cover and safe/retirement assets — and shows what to shore up.' },
  { sel: '[data-tour="nav-budget"]', title: 'Budget', body: 'Set monthly spending limits per category with green/amber/red progress and over-budget alerts.' },
  { sel: '[data-tour="nav-goals"]', title: 'Goals', body: 'Savings targets (emergency fund, house, trip…) with progress rings and the monthly amount needed to get there.' },
  { sel: '[data-tour="nav-reports"]', title: 'Reports', body: 'Charts over time — net-worth trend, income vs expense, and where your money goes by category.' },
  { sel: '[data-tour="nav-recurring"]', title: 'Recurring', body: 'Set up bills and income that repeat — they post automatically and show up as upcoming on your dashboard.' },
  { sel: '[data-tour="nav-settings"]', title: 'Settings', body: 'Appearance (themes & accents), profiles, encrypted backup/restore, display currency, and erase-data.' },
  { sel: '[data-tour="profile"]', title: 'Profiles', body: 'Keep separate, fully-isolated books for yourself, your spouse, or a business. Switch anytime from here.' },
  { sel: '[data-tour="ghost"]', title: 'Privacy mode', body: 'One tap hides every amount on screen. Your data never leaves this device, ever.' },
  { sel: '[data-tour="theme"]', title: 'Make it yours', body: 'Switch light / dark / system here, and pick an accent colour in Settings → Appearance.' },
];

const DONE_KEY = 'ftos-tour-done';

export function Tour() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const start = useCallback(() => {
    // Go to the dashboard first so every step's control exists.
    router.push('/dashboard');
    setI(0);
    setRunning(true);
  }, [router]);

  // Auto-start once on first run, and listen for manual replays.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onDash = window.location.pathname.includes('dashboard') || window.location.pathname === '/';
    let t: ReturnType<typeof setTimeout> | undefined;
    if (!localStorage.getItem(DONE_KEY) && onDash) t = setTimeout(start, 800);
    const replay = () => { localStorage.removeItem(DONE_KEY); start(); };
    window.addEventListener('ftos:start-tour', replay);
    return () => { if (t) clearTimeout(t); window.removeEventListener('ftos:start-tour', replay); };
  }, [start]);

  // Track the current target's position (retry a few times so it works right
  // after navigation / scroll without ever dropping the step).
  useEffect(() => {
    if (!running) return;
    const measure = () => {
      const el = document.querySelector(STEPS[i].sel) as HTMLElement | null;
      const shown = el && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
      if (shown) { el!.scrollIntoView({ block: 'center', behavior: 'smooth' }); setRect(el!.getBoundingClientRect()); }
      else setRect(null); // control not on screen → explain it centered (never skip)
    };
    measure();
    const timers = [setTimeout(measure, 200), setTimeout(measure, 500)];
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { timers.forEach(clearTimeout); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [running, i]);

  if (!running) return null;
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const finish = () => { localStorage.setItem(DONE_KEY, '1'); setRunning(false); };

  const W = 320;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
  // When pinned to a control: below it if room, else above. When centered: middle.
  const below = rect ? rect.bottom + 200 < vh : true;
  const top = rect ? (below ? rect.bottom + 14 : Math.max(12, rect.top - 196)) : Math.max(12, vh / 2 - 96);
  const left = rect ? Math.min(Math.max(12, rect.left), vw - W - 12) : Math.max(12, vw / 2 - W / 2);

  return (
    <div className="fixed inset-0 z-[200]">
      {/* dim the page; spotlight the control if visible */}
      {rect ? (
        <div className="absolute rounded-[14px] transition-all duration-300 pointer-events-none"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: '0 0 0 9999px rgba(12,14,22,0.55)', border: '2px solid var(--accent)' }} />
      ) : (
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(12,14,22,0.55)' }} />
      )}
      <div className="absolute card p-4 shadow-xl" style={{ top, left, width: W }}>
        <div className="eyebrow">Step {i + 1} of {STEPS.length}</div>
        <h3 className="mt-1 text-[15px] font-bold tracking-tight">{step.title}</h3>
        <p className="mt-1.5 text-[13px] text-ink-soft leading-relaxed">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button onClick={finish} className="text-[12.5px] text-muted hover:text-ink transition-colors">Skip</button>
          <div className="flex gap-2">
            {i > 0 && <Button variant="soft" onClick={() => setI(i - 1)}>Back</Button>}
            <Button variant="primary" onClick={() => (last ? finish() : setI(i + 1))}>{last ? 'Done' : 'Next'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
