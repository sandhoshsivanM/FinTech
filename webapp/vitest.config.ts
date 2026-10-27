import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Files in packages/ui-ts sit outside this app's tsconfig, so esbuild would
  // fall back to classic React.createElement JSX there. Next uses the
  // automatic runtime everywhere; so does this.
  esbuild: { jsx: 'automatic' },
  resolve: {
    // Mirror the tsconfig "@/*" -> "./src/*" path alias.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Shared packages (ADR 0007). They have no node_modules of their own,
      // so their dependencies resolve from this app's: one copy of React.
      '@khazana/domain': fileURLToPath(new URL('../packages/domain-ts/src', import.meta.url)),
      '@khazana/ui': fileURLToPath(new URL('../packages/ui-ts/src', import.meta.url)),
      '@khazana/screens': fileURLToPath(new URL('../packages/screens-ts/src', import.meta.url)),
      ...Object.fromEntries(
        ['decimal.js', 'clsx', 'lucide-react', 'framer-motion', 'react', 'react-dom', 'zustand', 'next', 'exceljs', 'xlsx', 'jspdf', 'jspdf-autotable'].map((dep) => [
          dep,
          fileURLToPath(new URL(`./node_modules/${dep}`, import.meta.url)),
        ]),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Domain tests + the migrated sync-merge test + component tests.
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/lib/**'],
    },
  },
});
