/**
 * NSE/BSE session state, derived from the clock alone.
 *
 * This makes no network call and needs no price feed — it is arithmetic on the
 * current time in IST, which is why it can live outside the demo-data layer and
 * be shown as fact rather than carrying a DEMO badge.
 *
 * Exchange holidays are NOT modelled: a trading holiday will read as "closed
 * for the weekend"-style copy only if it falls on one. `status` is therefore
 * accurate to the session window and the weekend, and no finer. Callers must
 * not present it as a guarantee that the market is transacting.
 */
export type MarketPhase = 'pre-open' | 'open' | 'closed';

export interface MarketState {
  phase: MarketPhase;
  /** Short label for the pill, e.g. "NSE open". */
  label: string;
  /** Local exchange time, "15:04". */
  clock: string;
  /** Minutes until the next phase change, or null when that is not meaningful. */
  minutesToChange: number | null;
}

const OPEN_MIN = 9 * 60 + 15;   // 09:15 IST
const CLOSE_MIN = 15 * 60 + 30; // 15:30 IST
const PRE_OPEN_MIN = 9 * 60;    // 09:00 IST

/** Minutes past midnight in IST, and the IST weekday, for a given instant. */
function istParts(now: Date): { minutes: number; weekday: number; hh: string; mm: string } {
  // Asia/Kolkata is UTC+5:30 with no DST, so the offset is a constant.
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60_000);
  const hh = ist.getUTCHours();
  const mm = ist.getUTCMinutes();
  return {
    minutes: hh * 60 + mm,
    weekday: ist.getUTCDay(), // 0 Sun … 6 Sat
    hh: String(hh).padStart(2, '0'),
    mm: String(mm).padStart(2, '0'),
  };
}

export function marketState(now: Date = new Date()): MarketState {
  const { minutes, weekday, hh, mm } = istParts(now);
  const clock = `${hh}:${mm}`;
  const weekend = weekday === 0 || weekday === 6;

  if (weekend) {
    return { phase: 'closed', label: 'Markets closed', clock, minutesToChange: null };
  }
  if (minutes >= PRE_OPEN_MIN && minutes < OPEN_MIN) {
    return { phase: 'pre-open', label: 'Pre-open', clock, minutesToChange: OPEN_MIN - minutes };
  }
  if (minutes >= OPEN_MIN && minutes < CLOSE_MIN) {
    return { phase: 'open', label: 'NSE open', clock, minutesToChange: CLOSE_MIN - minutes };
  }
  return { phase: 'closed', label: 'NSE closed', clock, minutesToChange: null };
}
