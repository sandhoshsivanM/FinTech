'use client';
import { useMemo } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useFmt } from '@/lib/useFmt';
import { liquidBalance, moneyAccounts } from '@khazana/domain/accountLedger';
import { AnimatedNumber, motion, tap } from '../motion';
import { SectionInfo } from '../Hint';

/**
 * The paise, set smaller and muted: the rupees are what a glance should read.
 * "₹44,36,934.00" → "₹44,36,934" + ".00".
 */
function withQuietPaise(s: string) {
  const m = s.match(/^(.*?)([.,]\d{2})$/);
  if (!m) return s;
  return (
    <>
      {m[1]}
      <span className="text-[0.5em] font-normal text-muted tracking-normal">{m[2]}</span>
    </>
  );
}

/**
 * "Total balance": every live bank and cash account, the money you can
 * actually spend. Counts up on arrival; the eye is the app-wide ghost toggle.
 */
export function BalanceHero() {
  const accounts = useApp((s) => s.accounts);
  const postings = useApp((s) => s.postings);
  const ghost = useApp((s) => s.ghost);
  const toggleGhost = useApp((s) => s.toggleGhost);
  const fmt = useFmt();

  const total = useMemo(() => liquidBalance(accounts, postings).toNumber(), [accounts, postings]);
  const count = useMemo(() => moneyAccounts(accounts).length, [accounts]);

  return (
    <div>
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <span>Total balance</span>
        <SectionInfo k="dashboard.totalBalance" />
        <motion.button
          {...tap}
          type="button"
          onClick={toggleGhost}
          aria-label={ghost ? 'Show amounts' : 'Hide amounts'}
          aria-pressed={ghost}
          className="focus-ring grid place-items-center w-7 h-7 rounded-full hover:bg-fill text-muted"
        >
          {ghost ? <EyeOff size={15} /> : <Eye size={15} />}
        </motion.button>
      </div>
      <div className="mt-1 text-[42px] font-light tracking-[-0.035em] leading-[1.05] tnum">
        {ghost ? (
          <span key="h" className="inline-block animate-[kz-pop_.35s_var(--ease)]">
            {fmt.symbol} ••••••
          </span>
        ) : (
          <span key="v" className="inline-block animate-[kz-pop_.35s_var(--ease)]">
            <AnimatedNumber value={total} format={(n) => fmt.money(n)} render={withQuietPaise} />
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[12px] text-muted">
        Across {count} account{count === 1 ? '' : 's'}
      </p>
    </div>
  );
}
