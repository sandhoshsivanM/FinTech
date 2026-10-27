'use client';
import { useEffect, useState } from 'react';

/**
 * The *resolved* theme, as actually applied to the document.
 *
 * `store.theme` is the user's preference and can be `'system'`, which is not a
 * colour. The store already writes the resolved value to
 * `document.documentElement.dataset.theme`, so that is the honest source for
 * chart colours — it accounts for the OS preference and for it changing while
 * the page is open.
 *
 * Starts `false` so the first server-rendered and hydrated paint agree; the
 * effect corrects it immediately after mount.
 */
export function useDarkMode(): boolean {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.dataset.theme === 'dark');
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return dark;
}
