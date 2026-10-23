// The 24-word recovery phrase (BIP-39 encoding of 256 random bits plus an
// 8-bit checksum). It wraps the account's data key (see e2e.ts); it is shown
// once, never sent anywhere, and is the only way back in if every device is
// lost (ADR 0005).
import { WORDS } from './wordlist';

const byPrefix = new Map(WORDS.map((w, i) => [w.slice(0, 4), i]));

async function checksumBits(entropy: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(entropy)));
  return hash[0].toString(2).padStart(8, '0');
}

const bits = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(2).padStart(8, '0')).join('');

/** 32 bytes of entropy → 24 words. */
export async function toPhrase(entropy: Uint8Array): Promise<string[]> {
  if (entropy.length !== 32) throw new Error('A recovery phrase encodes exactly 32 bytes.');
  const all = bits(entropy) + (await checksumBits(entropy));
  return Array.from({ length: 24 }, (_, i) => WORDS[parseInt(all.slice(i * 11, i * 11 + 11), 2)]);
}

/**
 * Typed words → the 24 canonical words. Forgiving about case, spacing and
 * punctuation, and accepts each word's first four letters (unique in the
 * list). Throws if a word is unknown, the count is wrong, or the checksum
 * fails (a typo or a swapped word).
 */
export async function parsePhrase(input: string): Promise<string[]> {
  const typed = input.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (typed.length !== 24) throw new PhraseError(`Enter all 24 words (you entered ${typed.length}).`);
  const indexes = typed.map((w, i) => {
    const index = byPrefix.get(w.slice(0, 4));
    if (index === undefined || !WORDS[index].startsWith(w)) throw new PhraseError(`Word ${i + 1} ("${w}") is not in the list.`);
    return index;
  });
  const all = indexes.map((n) => n.toString(2).padStart(11, '0')).join('');
  const entropy = Uint8Array.from({ length: 32 }, (_, i) => parseInt(all.slice(i * 8, i * 8 + 8), 2));
  if (all.slice(256) !== (await checksumBits(entropy))) {
    throw new PhraseError('These words don’t form a valid phrase. Check for a typo or two words swapped.');
  }
  return indexes.map((n) => WORDS[n]);
}

export class PhraseError extends Error {}
