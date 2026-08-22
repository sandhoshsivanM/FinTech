// The checklist item: "Add info icons (i) for all financial terms — short,
// simple explanation on hover/tap."
//
// The component existed and was wired to one screen out of ~25, so these cover
// the three shared components the rollout goes through, plus the glossary's own
// house rules. Before this, the only assertions lived on the dashboard.
import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Wallet } from 'lucide-react';
import { Hint } from './Hint';
import { Kpi } from './Kpi';
import { StatStrip } from './ui';
import { GLOSSARY, type TermKey } from '@/lib/glossary';

beforeEach(cleanup);

describe('the affordance itself', () => {
  test('says nothing until asked', () => {
    render(<Hint term="netWorth" />);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  test('a tap opens the explanation and wires it to the control', async () => {
    // Deliberately not the `title` attribute: that waits a second, is styled by
    // the platform, and never appears on a touch screen at all.
    const user = userEvent.setup();
    render(<Hint term="netWorth" />);
    await user.click(screen.getByRole('button'));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent(/everything you own minus everything you owe/i);
    expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', tip.id);
  });

  test('the button names its own term', () => {
    render(<Hint term="xirr" />);
    // "What is xirr?" rather than fifty identical "more info" buttons.
    expect(screen.getByRole('button', { name: /what is xirr/i })).toBeInTheDocument();
  });

  test('escape closes it', async () => {
    const user = userEvent.setup();
    render(<Hint term="weight" />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  test('a click outside closes it', async () => {
    const user = userEvent.setup();
    render(<div><Hint term="weight" /><button type="button">elsewhere</button></div>);
    await user.click(screen.getByRole('button', { name: /what is weight/i }));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  test('a right-aligned hint anchors to the right edge', async () => {
    // Table columns of figures are right-aligned; a fixed-width panel anchored
    // left on the last column opens off the side of the screen.
    const user = userEvent.setup();
    render(<Hint term="weight" align="right" />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('tooltip').className).toContain('right-0');
  });
});

describe('the shared components carry it', () => {
  test('a KPI tile explains its label', async () => {
    const user = userEvent.setup();
    render(<Kpi label="Unrealised P&L" value="₹1,200" icon={Wallet} term="unrealisedPnl" />);
    await user.click(screen.getByRole('button', { name: /what is unrealised/i }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/you have not sold/i);
  });

  test('the KPI hint survives a label long enough to truncate', () => {
    // It sits outside the `truncate` span on purpose — inside, it would be
    // clipped away exactly when the label is long enough to need explaining.
    render(<Kpi label="An extremely long label that will certainly truncate" value="1" icon={Wallet} term="weight" />);
    expect(screen.getByRole('button', { name: /what is weight/i })).toBeInTheDocument();
  });

  test('a StatStrip cell explains its label, and is not clipped away', async () => {
    // The strip's wrapper used to be `overflow-hidden`, which swallowed the
    // popover whole.
    const user = userEvent.setup();
    const { container } = render(
      <StatStrip items={[{ label: 'Emergency fund', value: '4.2 mo', term: 'emergencyFund' }]} />,
    );
    expect(container.querySelector('.overflow-hidden')).toBeNull();
    await user.click(screen.getByRole('button', { name: /what is emergency fund/i }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/months of your usual spending/i);
  });

  test('a seven-cell strip gets seven columns, not four', () => {
    // The map used to cover 2..5 only and fall through to `md:grid-cols-4`, so
    // the spec's own five-to-seven-cell strip silently wrapped to two rows.
    const items = Array.from({ length: 7 }, (_, i) => ({ label: `L${i}`, value: `${i}` }));
    const { container } = render(<StatStrip items={items} />);
    expect(container.querySelector('.xl\\:grid-cols-7')).toBeTruthy();
  });
});

describe('the glossary keeps its house rules', () => {
  const entries = Object.entries(GLOSSARY) as [TermKey, { title: string; body: string }][];

  test('covers the jargon the review singled out', () => {
    for (const key of ['ltp', 'avalanche', 'snowball', 'sumAssured', 'safeToSpend',
      'weightedApr', 'coverageGap', 'emergencyFund', 'xirr', 'utilisation',
      'longTerm', 'shortTerm', 'weight'] as TermKey[]) {
      expect(GLOSSARY[key], `missing glossary entry: ${key}`).toBeTruthy();
    }
  });

  test('every entry is one or two sentences, not a paragraph', () => {
    // A definition that needs a paragraph is a sign the figure itself needs
    // rethinking — that rule is in the file header, so it should be checked.
    for (const [key, term] of entries) {
      const sentences = term.body.split(/[.!?](?:\s|$)/).filter(Boolean).length;
      expect(sentences, `${key} has ${sentences} sentences`).toBeLessThanOrEqual(3);
      expect(term.body.length, `${key} is too long`).toBeLessThanOrEqual(260);
    }
  });

  test('no entry is empty or a placeholder', () => {
    for (const [key, term] of entries) {
      expect(term.title.trim().length, key).toBeGreaterThan(2);
      expect(term.body.trim().length, key).toBeGreaterThan(30);
      expect(term.body, key).not.toMatch(/TODO|TBD|lorem/i);
    }
  });

  test('a body never opens by restating its own title verbatim', () => {
    // "Net worth: net worth is..." teaches nothing. The house rule is to say
    // what the number IS before what it is for.
    for (const [key, term] of entries) {
      expect(term.body.toLowerCase().startsWith(term.title.toLowerCase()), key).toBe(false);
    }
  });
});
