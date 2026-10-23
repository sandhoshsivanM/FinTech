// Writes out/_headers after `next build` (see headers.mjs for why).
import { writeFileSync } from 'node:fs';
import { headersFile } from './headers.mjs';

const gateway = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:5196';
const google = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
writeFileSync(new URL('../out/_headers', import.meta.url), headersFile(gateway, { google }));
console.log(`wrote out/_headers (connect-src: ${gateway}${google ? ', Google sign-in' : ''})`);
