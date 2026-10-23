import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // packages/ui-ts sits outside this app's tsconfig; use the automatic JSX
  // runtime there too, as Next does.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@khazana/domain': fileURLToPath(new URL('../packages/domain-ts/src', import.meta.url)),
      '@khazana/ui': fileURLToPath(new URL('../packages/ui-ts/src', import.meta.url)),
      // The shared packages have no node_modules of their own: one copy of each, from here.
      ...Object.fromEntries(
        ['decimal.js', 'clsx', 'lucide-react', 'framer-motion', 'react', 'react-dom'].map((dep) => [
          dep,
          fileURLToPath(new URL(`./node_modules/${dep}`, import.meta.url)),
        ]),
      ),
    },
  },
  test: {
    // Node has Web Crypto; IndexedDB comes from fake-indexeddb in the tests that need it.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
