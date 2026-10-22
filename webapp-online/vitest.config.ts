import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@khazana/domain': fileURLToPath(new URL('../packages/domain-ts/src', import.meta.url)),
      'decimal.js': fileURLToPath(new URL('./node_modules/decimal.js', import.meta.url)),
    },
  },
  test: {
    // Node has Web Crypto; IndexedDB comes from fake-indexeddb in the tests that need it.
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
