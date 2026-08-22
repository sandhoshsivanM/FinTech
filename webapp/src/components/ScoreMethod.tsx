'use client';
/**
 * "How is this calculated?" for the financial health score.
 *
 * The score's most confusing property is not the weighting — it is
 * renormalisation. Untracked areas leave the denominator entirely, so adding
 * your first insurance policy can move the score DOWN even though you are
 * better protected than you were the day before: Protection has stopped being
 * excluded and started being judged. Without that stated somewhere, the number
 * looks arbitrary exactly when someone has done the right thing, which is the
 * worst possible moment to lose their trust.
 *
 * The weights and bands are read from the domain rather than retyped, so this
 * panel cannot drift out of agreement with the score it describes.
 */
import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import clsx from 'clsx';
import { GlassCard } from '@/components/ui';
import { CATEGORY_WEIGHTS, MIN_GRADABLE_WEIGHT } from '@/domain/health';

const AREA_LABEL: Record<keyof typeof CATEGORY_WEIGHTS, string> = {
  wealth: 'Wealth',
  protection: 'Protection',
  efficiency: 'Efficiency',
  future: 'Future',
};

const AREA_BLURB: Record<keyof typeof CATEGORY_WEIGHTS, string> = {
  wealth: 'How your assets are growing, how much of them is invested, and whether too much sits in one place.',
  protection: 'Your emergency fund, and whether your life and health cover match your income.',
  efficiency: 'What share of your income you keep, how much debt you carry against your assets, and whether you stay inside your budgets.',
  future: 'Retirement assets, the pace you are hitting your goals at, and how much of your portfolio can still grow.',
};

const BANDS: [string, string][] = [
  ['85 and above', 'Excellent'],
  ['70–84', 'Strong'],
  ['55–69', 'Fair'],
  ['40–54', 'Needs work'],
  ['Below 40', 'At risk'],
];

export function ScoreMethod() {
  const [open, setOpen] = useState(false);
  const areas = Object.entries(CATEGORY_WEIGHTS) as [keyof typeof CATEGORY_WEIGHTS, number][];
  const total = areas.reduce((s, [, w]) => s + w, 0);

  return (
    <GlassCard className="p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center gap-2 px-5 py-4 text-left transition-colors hover:bg-[var(--fill)]"
      >
        <HelpCircle size={16} className="text-muted shrink-0" aria-hidden="true" />
        <span className="flex-1 text-[15px] font-semibold tracking-tight">
          How is this calculated?
        </span>
        <ChevronDown
          size={16}
          className={clsx('text-muted transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="border-t border-line px-5 py-4 text-[13.5px] leading-relaxed text-ink-soft">
          <p>
            Four areas, each worth a fixed number of points out of {total}. Inside an
            area, each check contributes its own share — the figure beside an area is
            the points it earned out of the points it can carry.
          </p>

          <ul className="mt-4 space-y-3">
            {areas.map(([key, weight]) => (
              <li key={key}>
                <span className="font-semibold text-ink">{AREA_LABEL[key]}</span>
                <span className="tnum text-muted"> · {weight} points</span>
                <span className="mt-0.5 block text-muted">{AREA_BLURB[key]}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 font-semibold text-ink">Areas you have not tracked are left out</p>
          <p className="mt-1">
            An area with no data is not scored zero — it is removed from the total
            entirely, and the remaining areas are measured against each other. This
            keeps the score honest about what it has seen, but it has one consequence
            worth knowing: <strong className="font-semibold text-ink">adding your first
            policy, goal or budget can move the score down</strong>, because that area
            has stopped being excluded and started being judged. That is the score
            learning something about you, not you getting worse.
          </p>

          <p className="mt-4">
            Below {MIN_GRADABLE_WEIGHT} points of tracked areas — fewer than two of the
            four — you get a number but no one-word grade. There is not yet enough to
            stand behind a verdict.
          </p>

          <p className="mt-4 font-semibold text-ink">Grades</p>
          <ul className="mt-1 space-y-0.5">
            {BANDS.map(([range, label]) => (
              <li key={label} className="flex gap-2">
                <span className="tnum w-24 shrink-0 text-muted">{range}</span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
