'use client';
import { StaggerItem } from '../motion';
import { BalanceHero } from './BalanceHero';
import { QuickActions } from './QuickActions';
import { WalletStack } from './WalletStack';
import { BudgetRingCard } from './BudgetRingCard';
import { LatestTransactions } from './LatestTransactions';

/**
 * The phone home screen: the everyday-money view, before the investment
 * dashboard that follows it. Hidden from 900px, where the sidebar layout has
 * room to lead with the full statement instead.
 */
export function PhoneHome() {
  return (
    <StaggerItem className="min-[900px]:hidden grid gap-6">
      <BalanceHero />
      <QuickActions />
      <WalletStack />
      <BudgetRingCard />
      <LatestTransactions />
    </StaggerItem>
  );
}
