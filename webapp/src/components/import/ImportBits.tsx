'use client';
/**
 * Presentational pieces shared by both halves of the import screen.
 *
 * Kept apart from the page so the page reads as flow rather than markup, and
 * so the Assets and Income tabs cannot drift into looking like two different
 * products.
 */
import { useRef, useState, type ReactNode } from 'react';
import {
  UploadCloud, FileWarning, CheckCircle2,
  CandlestickChart, Globe, Vault, Layers, Landmark,
} from 'lucide-react';
import { GlassCard } from '@/components/ui';
import { ACCEPTED_EXTENSIONS } from '@/lib/sheet';
import type { Institution } from '@/lib/institutions';

/* ---- Institution picker --------------------------------------------------- */

/**
 * One icon per kind of institution, from the single Lucide family.
 *
 * This replaces a coloured square containing one or two letters — "5p", "TT",
 * "St". Those initials are not anybody's mark, they say nothing the name beside
 * them does not, and a grid of them is the contact-avatar pattern lifted from
 * an address book. An icon that distinguishes a *depository* from a *broker*
 * from a *bank* carries information instead, which is the whole difference
 * between decoration and design.
 *
 * Real logos stay out on purpose: bundling bank trademarks bloats the export
 * and invites a licensing question, for no functional gain.
 */
const KIND_ICON = {
  broker: CandlestickChart,
  global: Globe,
  depository: Vault,
  funds: Layers,
  bank: Landmark,
} as const;

const KIND_LABEL = {
  broker: 'Broker',
  global: 'International broker',
  depository: 'Depository',
  funds: 'Mutual-fund platform',
  bank: 'Bank',
} as const;

export function InstitutionBadge({ inst }: { inst: Institution }) {
  const Icon = KIND_ICON[inst.kind];
  return (
    <Icon
      size={16}
      strokeWidth={1.75}
      aria-hidden
      className="shrink-0"
      // The brand hue is kept — it is the one genuinely identifying thing about
      // an institution — but it now tints a mark rather than filling a tile.
      style={{ color: inst.color }}
    />
  );
}

/** The institution kind, spelled out. Used as the accessible description. */
export const institutionKindLabel = (inst: Institution) => KIND_LABEL[inst.kind];

export function InstitutionGrid({
  institutions,
  selected,
  onSelect,
}: {
  institutions: Institution[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {institutions.map((inst) => {
        const active = inst.id === selected;
        return (
          <button
            key={inst.id}
            type="button"
            onClick={() => onSelect(inst.id)}
            aria-pressed={active}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-[var(--radius-card)] border text-sm font-semibold transition-colors ${
              active
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[var(--line)] hover:border-[var(--accent)]/50'
            }`}
          >
            <InstitutionBadge inst={inst} />
            {inst.name}
          </button>
        );
      })}
    </div>
  );
}

/** The "How to export from X" panel. */
export function ExportGuide({ inst }: { inst: Institution }) {
  return (
    <GlassCard>
      <h3 className="font-bold">How to export from {inst.name}</h3>
      <ol className="mt-3 space-y-1.5 text-sm list-decimal list-inside">
        {inst.steps.map((s, i) => (
          <li key={i} className="text-muted">
            <span className="text-[var(--fg)]">{s}</span>
          </li>
        ))}
      </ol>
      {inst.links?.length ? (
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {inst.links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] font-semibold hover:underline"
            >
              {l.label}
            </a>
          ))}
        </div>
      ) : null}
      {inst.note ? <p className="mt-3 text-xs text-muted leading-relaxed">{inst.note}</p> : null}
    </GlassCard>
  );
}

/* ---- Drop zone ------------------------------------------------------------ */

export function DropZone({
  onFile,
  busy,
  filename,
  hint,
}: {
  onFile: (f: File) => void;
  busy: boolean;
  filename?: string;
  hint?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      onClick={() => ref.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') ref.current?.click(); }}
      className={`rounded-[var(--radius-card)] border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
        over ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--line)] hover:border-[var(--accent)]/50'
      }`}
    >
      <input
        ref={ref}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          // Lets the same file be picked twice after a failed parse.
          e.target.value = '';
        }}
      />
      <UploadCloud size={26} className="mx-auto text-muted" />
      <p className="mt-3 font-semibold">
        {busy ? 'Reading file…' : filename ? filename : 'Drag & drop your file here'}
      </p>
      <p className="mt-1 text-xs text-muted">
        {hint ?? 'or click to browse · .csv, .txt, .xls, .xlsx'}
      </p>
    </div>
  );
}

/* ---- Result banners ------------------------------------------------------- */

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-[var(--radius-card)] border border-[var(--expense)]/40 bg-[var(--expense)]/10 p-3.5 text-sm">
      <FileWarning size={17} className="shrink-0 mt-0.5" style={{ color: 'var(--expense)' }} />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

export function InfoNote({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'ok' }) {
  const color = tone === 'ok' ? 'var(--income)' : 'var(--warn)';
  return (
    <div
      className="flex gap-2.5 rounded-[var(--radius-card)] border p-3.5 text-sm"
      style={{ borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} 10%, transparent)` }}
    >
      <CheckCircle2 size={17} className="shrink-0 mt-0.5" style={{ color }} />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

/* ---- Preview table -------------------------------------------------------- */

export function PreviewTable({
  headers,
  rows,
  total,
  cap = 8,
}: {
  headers: string[];
  rows: ReactNode[][];
  total: number;
  cap?: number;
}) {
  return (
    <div>
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--line)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]">
              {headers.map((h) => (
                <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, cap).map((r, i) => (
              <tr key={i} className="border-b border-[var(--line)] last:border-0">
                {r.map((c, j) => (
                  <td key={j} className="px-3 py-2 whitespace-nowrap">{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > cap && (
        <p className="mt-2 text-xs text-muted">
          Showing the first {cap} of {total.toLocaleString()} rows.
        </p>
      )}
    </div>
  );
}
