// Proves the RTL + jsdom path works end-to-end: real Zustand store → real
// safetyNet() domain → rendered page. Seeds the store, asserts the score and
// labels render, and that ghost mode masks money.
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useApp } from '@/lib/store';
import type { Txn, Goal, Insurance, Holding } from '@/lib/types';
import SafetyNetPage from './page';

// next/link needs no router context for a static anchor in tests.
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

const txn = (amount: string, type: 'income' | 'expense'): Txn => ({
  id: `t${amount}${type}`, vaultId: 'v', amount, type, categoryId: 'c',
  date: Date.now() - 30 * 86_400_000, createdAt: Date.now(),
});
const goal = (current: string, target: string): Goal => ({
  id: `g${current}`, vaultId: 'v', name: 'EF', goalType: 'emergency_fund',
  targetAmount: target, currentAmount: current,
});
const ins = (type: Insurance['type'], cover: string): Insurance => ({
  id: `i${type}`, vaultId: 'v', name: type, type, coverAmount: cover, premium: '1000',
});
const fd = (price: string): Holding => ({
  id: 'h1', vaultId: 'v', symbol: 'FD', exchange: 'NSE',
  quantity: '1', avgCost: price, lastPrice: price, assetType: 'fd',
});

function seed(ghost = false) {
  useApp.setState({
    txns: [txn('1000000', 'income')],
    goals: [goal('600000', '600000')],
    insurances: [ins('life', '10000000'), ins('health', '500000')],
    holdings: [fd('1000000')],
    ghost,
    currencyCode: 'INR',
  });
}

describe('SafetyNetPage', () => {
  beforeEach(() => cleanup());

  test('renders the readiness score and pillar labels', () => {
    seed();
    render(<SafetyNetPage />);
    // Fully-covered fixture → score 100 (asserted in the domain test).
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('Excellent')).toBeInTheDocument();
    expect(screen.getByText('Safety-net readiness')).toBeInTheDocument();
    expect(screen.getAllByText('Emergency fund').length).toBeGreaterThan(0);
    expect(screen.getByText('Insurance cover')).toBeInTheDocument();
    expect(screen.getByText('Safe & retirement assets')).toBeInTheDocument();
  });

  test('ghost mode masks monetary values', () => {
    seed(true);
    render(<SafetyNetPage />);
    // Score still shows; amounts are masked with bullets.
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getAllByText('••••••').length).toBeGreaterThan(0);
  });
});
