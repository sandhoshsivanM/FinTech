// Crypto benchmark — measures the real vault primitives from src/lib/crypto.ts
// (PBKDF2-HMAC-SHA256 @ 600k iterations → AES-256-GCM). Prints measured numbers
// so performance claims cite measurements, not targets.
//
// Run with:  node scripts/bench-crypto.ts   (Node 24+ strips TS types natively)
import { deriveKey, encryptJson, decryptJson, randomBytes } from '../src/lib/crypto.ts';

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return { mean: sum / sorted.length, p50: pct(50), p95: pct(95), min: sorted[0], max: sorted[sorted.length - 1] };
}

async function benchPbkdf2(runs: number) {
  const salt = randomBytes(32);
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await deriveKey('correct horse battery staple', salt);
    samples.push(performance.now() - t0);
  }
  return stats(samples);
}

async function benchGcm(runs: number) {
  const key = await deriveKey('pin', randomBytes(32));
  // Representative record: a transaction-sized JSON object.
  const record = {
    id: 'txn-0001', vaultId: 'v', amount: '12345.67', type: 'expense',
    categoryId: 'food', merchant: 'BigBasket', note: 'weekly groceries',
    date: 1_700_000_000_000, createdAt: 1_700_000_000_000,
  };
  const enc: number[] = [];
  const dec: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const ct = await encryptJson(key, record);
    enc.push(performance.now() - t0);
    const t1 = performance.now();
    await decryptJson(key, ct);
    dec.push(performance.now() - t1);
  }
  return { enc: stats(enc), dec: stats(dec) };
}

const fmt = (ms: number) => `${ms.toFixed(3)} ms`;
const opsPerSec = (ms: number) => `${Math.round(1000 / ms).toLocaleString()} ops/s`;

(async () => {
  console.log('Khazana web crypto benchmark (Web Crypto / Node)');
  console.log(`Node ${process.version}\n`);

  const kdf = await benchPbkdf2(10);
  console.log('PBKDF2-HMAC-SHA256, 600,000 iterations → 256-bit key (10 runs)');
  console.log(`  mean ${fmt(kdf.mean)} · p50 ${fmt(kdf.p50)} · p95 ${fmt(kdf.p95)} · min ${fmt(kdf.min)} · max ${fmt(kdf.max)}\n`);

  const gcm = await benchGcm(2000);
  console.log('AES-256-GCM on a transaction-sized record (2,000 runs)');
  console.log(`  encrypt: mean ${fmt(gcm.enc.mean)} (${opsPerSec(gcm.enc.mean)})`);
  console.log(`  decrypt: mean ${fmt(gcm.dec.mean)} (${opsPerSec(gcm.dec.mean)})`);
})();
