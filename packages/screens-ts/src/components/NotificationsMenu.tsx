'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Bell, BellRing, CreditCard, History, Inbox, ShieldAlert } from 'lucide-react';
import { evaluateAlerts, triggered } from '@khazana/domain/alerts';
import { useApp } from '../store';
import { useNow } from '../lib/useNow';
import { loadSeen, markOneSeen, markSeen, unreadCount } from '../lib/notifSeen';
import { IconBtn } from './ShellFrame';

/** A reminder whose moment passed while the app was closed. */
export interface MissedNotification { dedupeKey: string; title: string; body: string; deepLink?: string | null }

/**
 * What the bell needs from the host's notification scheduler. The offline app
 * runs one (local notifications, missed reminders); an app without one passes
 * nothing and the bell lists only what is derivable from the records.
 */
export type NotificationDriver = () => { plan: { missed: MissedNotification[] }; acknowledgeMissed: () => void };

const noDriver: NotificationDriver = () => ({ plan: { missed: [] }, acknowledgeMissed: () => {} });

/**
 * Notifications.
 *
 * Everything listed is derived from records already in the vault — alerts whose
 * condition holds, bills due inside a week, policies renewing inside a month.
 * Nothing is pushed and nothing is fetched; the badge only appears when there
 * is genuinely something to see.
 */
export function NotificationsMenu({ useDriver = noDriver }: { useDriver?: NotificationDriver } = {}) {
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
  const { plan, acknowledgeMissed } = useDriver();

  const items = useMemo(() => {
    // `key` is the occurrence key read-state is tracked by (see notifSeen.ts):
    // it changes only when the item itself does, never with "due in N days".
    const out: { id: string; key: string; icon: 'alert' | 'bill' | 'policy' | 'missed'; title: string; sub: string; href: string }[] = [];
    if (!now) return out;
    const DAY = 86_400_000;

    for (const m of plan.missed) {
      out.push({
        id: `m-${m.dedupeKey}`,
        key: `m-${m.dedupeKey}`,
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
      out.push({ id: `a-${e.alert.id}`, key: `a-${e.alert.id}`, icon: 'alert', title: e.alert.label, sub: e.message, href: '/alerts' });
    }
    for (const b of recurring) {
      const days = Math.ceil((b.nextRun - now) / DAY);
      if (days <= 7) {
        out.push({
          id: `b-${b.id}`,
          key: `b-${b.id}:${b.nextRun}`,
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
          key: `p-${p.id}:${p.renewalDate}`,
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

  // Read-state. Loaded after mount (browser storage is client-only; the page is
  // statically exported), so the first paint never disagrees with hydration.
  const [seen, setSeen] = useState<Set<string> | null>(null);
  useEffect(() => { setSeen(loadSeen()); }, []);
  const keys = useMemo(() => items.map((n) => n.key), [items]);
  const unread = seen ? unreadCount(keys, seen) : 0;

  return (
    <div className="relative shrink-0">
      <IconBtn
        label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        onClick={() => {
          // Opening the menu *is* the delivery for a missed reminder — there is
          // no other channel it could have arrived through. Marking it here is
          // what stops it being offered again on every visit forever.
          // Opening the menu delivers missed reminders, but does not read
          // anything: each item is marked read only when it is opened, so the
          // others stay new until the user gets to them.
          if (!open) {
            acknowledgeMissed();
          }
          setOpen((o) => !o);
        }}
        className="relative"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-1.5 right-2 w-[7px] h-[7px] rounded-full bg-danger ring-2 ring-[var(--canvas)]" />
        )}
      </IconBtn>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-[320px] z-50 card overflow-hidden shadow-[var(--shadow-2)]">
            <div className="px-4 py-3 border-b border-line flex items-center gap-2">
              <p className="eyebrow">Notifications</p>
              {unread > 0 && (
                <>
                  <span className="ml-auto text-[11px] font-semibold text-muted">{unread} new</span>
                  <button
                    type="button"
                    onClick={() => setSeen(markSeen(keys))}
                    className="focus-ring text-[11px] font-semibold text-ink hover:underline"
                  >
                    Mark all as read
                  </button>
                </>
              )}
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
                  const fresh = seen ? !seen.has(n.key) : false;
                  return (
                    <Link
                      key={n.id}
                      href={n.href}
                      onClick={() => {
                        if (seen) setSeen(markOneSeen(n.key, keys, seen));
                        setOpen(false);
                      }}
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
                        <span className={clsx('block text-[13px] truncate', fresh ? 'font-semibold text-ink' : 'font-normal text-ink-soft')}>{n.title}</span>
                        <span className="block text-[11.5px] text-muted">{n.sub}</span>
                      </span>
                      {fresh && <span aria-label="New" className="shrink-0 w-2 h-2 rounded-full bg-[var(--data-blue)]" />}
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
