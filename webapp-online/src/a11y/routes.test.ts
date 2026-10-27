// Keeps the list of shared routes honest: every app/<route>/page.tsx that re-exports a shared
// screen is covered by the accessibility tests, and every listed route exists.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { SHARED_ROUTES } from './routes';

const app = fileURLToPath(new URL('../app', import.meta.url));

test('every re-exported shared screen is in SHARED_ROUTES, and each listed route re-exports its screen', () => {
  const reexported = readdirSync(app, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(app, d.name, 'page.tsx')))
    .filter((d) => /@khazana\/screens\/pages\//.test(readFileSync(join(app, d.name, 'page.tsx'), 'utf8')))
    .map((d) => d.name)
    .sort();
  expect(reexported).toEqual([...SHARED_ROUTES].sort());
  for (const route of SHARED_ROUTES) {
    expect(readFileSync(join(app, route, 'page.tsx'), 'utf8')).toContain(`@khazana/screens/pages/${route}'`);
  }
});

test('the app serves no screen that needs the offline vault', () => {
  for (const gone of ['diagnostics', 'account']) expect(existsSync(join(app, gone, 'page.tsx'))).toBe(false);
});
