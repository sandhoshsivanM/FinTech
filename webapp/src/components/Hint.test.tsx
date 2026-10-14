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
import { GLOSSARY, SECTION_HELP, HELP, type TermKey, type SectionKey } from '@/lib/glossary';
import { Section } from './primitives';
import { SectionHeader } from './ui';
import { CardTitle, SectionInfo } from './Hint';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
    expect(screen.getByRole('tooltip')).toHaveAttribute('data-align', 'right');
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

// ---- Section help: the ⓘ beside every card title ---------------------------
describe('section help keeps the same house rules', () => {
  const entries = Object.entries(SECTION_HELP) as [SectionKey, { title: string; body: string }][];
  const routes = new Set(
    readdirSync(join(__dirname, '../app')).filter((d) => statSync(join(__dirname, '../app', d)).isDirectory()),
  );

  test('there is section help to test', () => {
    expect(entries.length).toBeGreaterThan(50);
  });

  test('every entry has a real title and a real body', () => {
    for (const [key, s] of entries) {
      expect(s.title.trim().length, key).toBeGreaterThan(2);
      expect(s.body.trim().length, key).toBeGreaterThan(30);
      expect(s.body, key).not.toMatch(/TODO|TBD|lorem/i);
      expect(s.body.toLowerCase().startsWith(s.title.toLowerCase()), key).toBe(false);
    }
  });

  test('every entry is one to three sentences, short enough for a phone popover', () => {
    for (const [key, s] of entries) {
      const sentences = s.body.split(/[.!?](?:\s|$)/).filter(Boolean).length;
      expect(sentences, `${key} has ${sentences} sentences`).toBeLessThanOrEqual(3);
      expect(s.body.length, `${key} is too long`).toBeLessThanOrEqual(320);
    }
  });

  test('titles are sentence case', () => {
    // "Spending by category", not "Spending By Category". Acronyms (FY, EMI,
    // NIFTY) are allowed to stay upper case.
    for (const [key, s] of entries) {
      // Proper nouns stay capitalised, and so does the first word after a
      // "Step 1 ·" prefix.
      const PROPER = new Set(['Khazana']);
      const words = s.title.split(/\s+/).filter((w, i, a) => i > 0 && a[i - 1] !== '·' && !PROPER.has(w));
      for (const w of words) {
        const titleCased = /^[A-Z][a-z]+$/.test(w);
        expect(titleCased, `${key}: "${w}" in "${s.title}"`).toBe(false);
      }
    }
  });

  test('every key names a route that exists', () => {
    for (const [key] of entries) {
      const [route, name] = key.split('.');
      expect(routes.has(route), `${key}: no src/app/${route}`).toBe(true);
      expect(name, key).toMatch(/^[a-z][A-Za-z0-9]*$/);
    }
  });

  test('section keys never shadow a glossary term', () => {
    for (const key of Object.keys(SECTION_HELP)) {
      expect(key in GLOSSARY, key).toBe(false);
      expect(HELP[key as SectionKey]).toBe(SECTION_HELP[key as SectionKey]);
    }
  });
});

describe('section titles carry their ⓘ', () => {
  const [key, help] = Object.entries(SECTION_HELP)[0] as [SectionKey, { title: string; body: string }];
  const label = new RegExp(`^What is ${help.title.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?$`);

  test('a Section with info shows a "What is …?" button that opens the text', async () => {
    const user = userEvent.setup();
    render(<Section title="Card title" info={key}><p>body</p></Section>);
    const btn = screen.getByRole('button', { name: label });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await user.click(btn);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent(help.title);
    expect(tip).toHaveTextContent(help.body.slice(0, 40));
    expect(btn).toHaveAttribute('aria-describedby', tip.id);
  });

  test('the button sits beside the heading, not inside it', () => {
    // Inside, "What is …?" would become part of the heading's accessible name
    // and every test that finds a card by its heading would break.
    render(<Section title="Card title" info={key}><p>body</p></Section>);
    expect(screen.getByRole('heading', { name: 'Card title' })).toBeInTheDocument();
  });

  test('a Section without info renders no button', () => {
    render(<Section title="Card title"><p>body</p></Section>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('SectionHeader and CardTitle carry the same ⓘ', () => {
    render(<div><SectionHeader title="One" info={key} /><CardTitle info={key}>Two</CardTitle></div>);
    expect(screen.getAllByRole('button', { name: label })).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'One' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Two' })).toBeInTheDocument();
  });

  test('the section icon is 16px', () => {
    render(<SectionInfo k={key} />);
    const btn = screen.getByRole('button');
    expect(btn.style.width).toBe('16px');
    expect(btn.querySelector('svg')?.getAttribute('width')).toBe('16');
  });

  test('the panel escapes a clipping card', async () => {
    // Several cards are `overflow-hidden` (tables, divided lists). The panel is
    // portalled to <body> so the card cannot swallow it.
    const user = userEvent.setup();
    const { container } = render(
      <div className="card overflow-hidden"><CardTitle info={key}>Clipped</CardTitle></div>,
    );
    await user.click(screen.getByRole('button', { name: label }));
    const tip = screen.getByRole('tooltip');
    expect(container.contains(tip)).toBe(false);
    expect(document.body.contains(tip)).toBe(true);
  });

  test('the panel stays inside a 390px viewport', async () => {
    const user = userEvent.setup();
    const prev = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    try {
      render(<CardTitle info={key}>Edge</CardTitle>);
      const btn = screen.getByRole('button', { name: label });
      // Pretend the icon sits 10px from the right edge of the phone.
      btn.getBoundingClientRect = () => ({ left: 370, right: 386, top: 100, bottom: 116, width: 16, height: 16, x: 370, y: 100, toJSON: () => ({}) });
      await user.click(btn);
      const tip = screen.getByRole('tooltip');
      const left = parseFloat(tip.style.left);
      const width = parseFloat(tip.style.width);
      expect(left).toBeGreaterThanOrEqual(8);
      expect(left + width).toBeLessThanOrEqual(390 - 8);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: prev });
    }
  });
});
