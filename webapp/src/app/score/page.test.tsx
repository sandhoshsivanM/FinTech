// The Score page's one non-negotiable: an untracked category renders the words
// "Not yet tracked", never a number. Everything else on this page is layout.
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useApp } from '@/lib/store';
import type { Insurance, Txn } from '@/lib/types';
import ScorePage from './page';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

const txn = (amount: string, type: 'income' | 'expense'): Txn => ({
  id: `t-${amount}-${type}`, vaultId: 'v', amount, type, categoryId: 'c',
  date: Date.now() - 30 * 86_400_000, createdAt: Date.now(),
});

const ins = (type: Insurance['type'], cover: string): Insurance => ({
  id: `i-${type}`, vaultId: 'v', name: type, type, coverAmount: cover, premium: '1000',
});

function seed(over: Partial<Parameters<typeof useApp.setState>[0]> = {}) {
  useApp.setState({
    txns: [txn('300000', 'income'), txn('150000', 'expense')],
    holdings: [], liabilities: [], goals: [], insurances: [], budgets: [],
    snapshots: [], categories: [], recurring: [], ghost: false,
    currencyCode: 'INR',
    ...over,
  });
}

beforeEach(cleanup);

describe('Score page', () => {
  test('a category with no data reads "Not yet tracked", not a score', () => {
    seed(); // no policies, so Protection cannot be judged
    render(<ScorePage />);
    expect(screen.getAllByText('Not yet tracked').length).toBeGreaterThan(0);
    // Specifically: it must not render as zero out of its weight.
    expect(screen.queryByText('0/25')).toBeNull();
  });

  test('an untracked category offers a way to start tracking it', () => {
    seed();
    render(<ScorePage />);
    expect(screen.getByText('Add a policy')).toBeTruthy();
  });

  test('the denominator is stated when the score is partial', () => {
    seed();
    render(<ScorePage />);
    expect(screen.getByText(/Based on \d of 4 areas/)).toBeTruthy();
  });

  test('an empty vault scores nothing rather than zero', () => {
    seed({ txns: [] });
    render(<ScorePage />);
    expect(screen.getByRole('img', { name: 'Not yet scored' })).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  test('a tracked category expands in place to show its metrics', () => {
    seed({ insurances: [ins('life', '10000000'), ins('health', '500000')] });
    render(<ScorePage />);
    // Collapsed: the metric detail is not in the document.
    expect(screen.queryByText('Life cover')).toBeNull();
    fireEvent.click(screen.getByText('Protection'));
    expect(screen.getByText('Life cover')).toBeTruthy();
    expect(screen.getByText('Health cover')).toBeTruthy();
  });

  test('an untracked category cannot be expanded', () => {
    seed();
    render(<ScorePage />);
    const button = screen.getByText('Protection').closest('button')!;
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  test('score history shows its empty state before any snapshots exist', () => {
    seed();
    render(<ScorePage />);
    expect(screen.getByText('Your score trend will appear here')).toBeTruthy();
  });

  test('links back to Reports, which lost its bottom-bar slot to this page', () => {
    seed();
    render(<ScorePage />);
    expect(screen.getByText('Full reports').closest('a')).toHaveProperty(
      'href',
      expect.stringContaining('/reports'),
    );
  });
});
