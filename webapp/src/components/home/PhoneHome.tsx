'use client';
import { StaggerItem } from '../motion';
import { BalanceHero } from './BalanceHero';
import { QuickActions } from './QuickActions';
import { WalletStack } from './WalletStack';
import { WeekFlowCard } from './WeekFlowCard';
import { BudgetRingCard } from './BudgetRingCard';
import { LatestTransactions } from './LatestTransactions';
import { InsightCard } from './InsightCard';
import { MonthTiles } from './MonthTiles';

/**
 * The phone home, in the Zentra order: the balance and the four round
 * shortcuts, the swipeable card stack, the week, one insight, the budget and
 * the latest activity — one calm column of cards on the canvas.
 *
 * Hidden from 900px, where the sidebar layout leads with the full statement.
 */
export function PhoneHome() {
  return (
    <StaggerItem className="min-[900px]:hidden grid gap-4">
      <div className="grid gap-5 pt-1">
        <BalanceHero />
        <QuickActions />
      </div>
      <WalletStack anchorId="wallet" />
      <WeekFlowCard />
      <InsightCard />
      <MonthTiles />
      <BudgetRingCard />
      <LatestTransactions />
    </StaggerItem>
  );
}

/**
 * The desktop twin: the same cards on the 12-column grid — balance and
 * shortcuts, the card stack and the insight across the top; the week and the
 * budget under them. Hidden below 900px, where PhoneHome takes over.
 */
export function DesktopHome() {
  return (
    <StaggerItem className="hidden min-[900px]:grid grid-cols-12 gap-4 items-start">
      <div className="card col-span-12 min-[1200px]:col-span-4 p-5 grid gap-5 h-full content-between">
        <BalanceHero />
        <QuickActions />
      </div>
      <div className="col-span-6 min-[1200px]:col-span-4"><WalletStack /></div>
      {/* Stretched to the row, so the card fills the height its neighbours set. */}
      <div className="col-span-6 min-[1200px]:col-span-4 self-stretch"><InsightCard /></div>
      <div className="col-span-12 min-[1200px]:col-span-8"><WeekFlowCard /></div>
      <div className="col-span-12 min-[1200px]:col-span-4"><BudgetRingCard /></div>
    </StaggerItem>
  );
}
