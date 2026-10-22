import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Mirror the tsconfig "@/*" -> "./src/*" path alias.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Shared domain package (ADR 0007). It has no node_modules of its own,
      // so decimal.js resolves from this app's.
      '@khazana/domain': fileURLToPath(new URL('../packages/domain-ts/src', import.meta.url)),
      'decimal.js': fileURLToPath(new URL('./node_modules/decimal.js', import.meta.url)),
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
