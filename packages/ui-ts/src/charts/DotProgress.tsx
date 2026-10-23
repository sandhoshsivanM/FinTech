/**
 * Progress as a row of dots — the goal track. Reads as "how many steps in",
 * which suits a savings goal better than a bar's implied precision. The dot
 * count is fixed so every goal's track lines up with the one above it.
 */
export function DotProgress({ fraction, color = 'var(--data-blue)', dots = 28, label }: {
  /** 0–1; clamped. */
  fraction: number;
  color?: string;
  dots?: number;
  label?: string;
}) {
  const f = Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) : 0;
  const filled = Math.round(f * dots);
  return (
    <span role="img" aria-label={label ?? `${Math.round(f * 100)}%`} className="flex justify-between gap-0.5 my-[3px]">
      {Array.from({ length: dots }, (_, i) => (
        <span
          key={i}
          className="w-[7px] h-[7px] rounded-full shrink-0"
          style={{ background: i < filled ? color : `color-mix(in srgb, ${color} 16%, transparent)` }}
        />
      ))}
    </span>
  );
}
