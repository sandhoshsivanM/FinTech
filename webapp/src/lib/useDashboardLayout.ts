'use client';
/**
 * The dashboard arrangement for one profile, remembered on this device.
 *
 * localStorage rather than the vault: it is a screen preference, like the
 * theme, not financial data — and a household sharing a vault on two devices
 * may well want different arrangements on a phone and a desktop. Keyed by
 * profile, so a business profile can lead with cash flow while a personal one
 * leads with the balance.
 */
import { useCallback, useState } from 'react';
import { resolveLayout, defaultLayout, type Layout } from '@khazana/domain/dashboardLayout';

const keyFor = (profileId: string) => `khazana-dashboard-layout:${profileId || 'default'}`;

function read(key: string): Layout {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
    return raw ? resolveLayout(JSON.parse(raw)) : defaultLayout();
  } catch {
    // Blocked storage or a corrupt entry: the default is always renderable.
    return defaultLayout();
  }
}

export function useDashboardLayout(profileId: string) {
  const key = keyFor(profileId);
  const [stored, setStored] = useState(() => ({ key, layout: read(key) }));
  // Switching profile swaps the layout during render rather than in an effect,
  // so the new profile never paints with the old one's arrangement.
  const current = stored.key === key ? stored : { key, layout: read(key) };
  if (current !== stored) setStored(current);

  const setLayout = useCallback((layout: Layout) => {
    setStored({ key, layout });
    try { window.localStorage.setItem(key, JSON.stringify(layout)); } catch { /* storage blocked: keep it for this session */ }
  }, [key]);

  const reset = useCallback(() => {
    setStored({ key, layout: defaultLayout() });
    try { window.localStorage.removeItem(key); } catch { /* nothing to remove */ }
  }, [key]);

  return { layout: current.layout, setLayout, reset };
}
