'use client';
import type { ReactNode } from 'react';
import { GlassCard } from '@khazana/ui/ui';
import { StaggerItem } from '@khazana/ui/motion';

/** One titled card of a legal page (privacy policy, terms). */
export function LegalSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <StaggerItem>
      <GlassCard>
        <div className="mb-3 flex items-center gap-2.5">
          <span className="text-accent">{icon}</span>
          <h2 className="text-[16px] font-medium tracking-[-0.01em]">{title}</h2>
        </div>
        <div className="grid gap-3 text-[13px] leading-relaxed text-ink-soft">{children}</div>
      </GlassCard>
    </StaggerItem>
  );
}
