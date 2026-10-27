// Shared test plumbing for the page-level accessibility checks: render into jsdom,
// flush effects, and run axe-core over the rendered markup.
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import axe from 'axe-core';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export type Rendered = { container: HTMLElement; root: Root; unmount: () => Promise<void> };

/** Renders inside a <main id="main"> so landmark rules see a whole page. `bare` skips it, for the shell, which brings its own. */
export async function render(ui: ReactElement, opts: { bare?: boolean } = {}): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(opts.bare ? ui : <main id="main">{ui}</main>);
  });
  await flush();
  return {
    container,
    root,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/** Lets pending promises and effects settle, inside act so React state updates are applied. */
export async function flush(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Clicks a control the way a user does: the event goes through React's act boundary. */
export async function click(el: Element): Promise<void> {
  await act(async () => {
    (el as HTMLElement).click();
  });
  await flush();
}

export async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush();
}

/** The control whose visible text (or aria-label) matches. Throws when there is none, so a test fails loudly. */
export function byText(container: ParentNode, text: string, selector = 'button, a'): HTMLElement {
  const match = [...container.querySelectorAll<HTMLElement>(selector)].find(
    (el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim() === text,
  );
  if (!match) throw new Error(`no ${selector} with text "${text}"`);
  return match;
}

/**
 * axe-core over the rendered markup. Colour contrast is computed from layout, which
 * jsdom does not have, so it is checked from the tokens in tokens.test.ts instead.
 */
export async function violations(el: Element): Promise<string[]> {
  const result = await axe.run(el, {
    rules: { 'color-contrast': { enabled: false } },
    resultTypes: ['violations'],
  });
  return result.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}. ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
  );
}
