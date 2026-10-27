import '@testing-library/jest-dom/vitest';

// jsdom implements no layout, so Element.scrollIntoView is simply absent.
// Any component that keeps a highlighted row in view calls it; stubbing it
// here keeps that behaviour out of production code, where it is real.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// The shared screens read the vault through KhazanaStoreProvider, as the app's
// layout provides it. Tests render screens bare, so every render in a test gets
// the same provider and platform adapters the layout installs. Loaded inside the
// mock factory so tests that never render (and mock the db or crypto modules)
// are not made to import the real store.
import { vi } from 'vitest';
import { createElement, type ReactNode } from 'react';

vi.mock('@testing-library/react', async (importOriginal) => {
  const rtl = await importOriginal<typeof import('@testing-library/react')>();
  const { KhazanaStoreProvider } = await import('@khazana/screens/store');
  const { useApp } = await import('@/lib/store');
  const { installScreensPlatform } = await import('@/lib/screensPlatform');
  installScreensPlatform();
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(KhazanaStoreProvider, { store: useApp }, children);
  const compose = (options?: { wrapper?: React.ComponentType<{ children: ReactNode }> }) => {
    const Inner = options?.wrapper;
    return {
      ...options,
      wrapper: Inner
        ? ({ children }: { children: ReactNode }) => createElement(Wrapper, null, createElement(Inner, null, children))
        : Wrapper,
    };
  };
  return {
    ...rtl,
    render: (ui: React.ReactElement, options?: object) => rtl.render(ui, compose(options)),
    renderHook: (hook: () => unknown, options?: object) => rtl.renderHook(hook, compose(options)),
  };
});
