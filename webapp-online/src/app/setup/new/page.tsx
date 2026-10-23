'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { keys } from '@/lib/account';
import { Button, Card, ErrorText, Muted, Page, describe } from '@/components/ui';

type Pending = { words: string[]; save: () => Promise<void> };

/** First device of a new account: create the data key and show the recovery phrase once. */
export default function NewAccountKey() {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>();
  const [stage, setStage] = useState<'show' | 'confirm'>('show');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    keys().createAccountKey().then(setPending).catch((err) => setError(describe(err)));
  }, []);

  // Three positions to type back, so the words were really written down.
  const asked = useMemo(() => {
    const picks = new Set<number>();
    while (picks.size < 3) picks.add(Math.floor(Math.random() * 24));
    return [...picks].sort((a, b) => a - b);
  }, []);

  const correct = pending && asked.every((i) => answers[i]?.trim().toLowerCase() === pending.words[i]);

  async function save() {
    if (!pending) return;
    setBusy(true);
    setError(undefined);
    try {
      await pending.save();
      router.replace('/home/');
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title="Your recovery phrase"
      lead="These 24 words are the only way back into your data if you lose every device. Khazana can’t see them and can’t reset them."
    >
      {stage === 'show' && pending && (
        <Card>
          <ol className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3" data-testid="recovery-words">
            {pending.words.map((w, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-6 text-right" style={{ color: 'var(--muted)' }}>{i + 1}.</span>
                <span className="font-medium">{w}</span>
              </li>
            ))}
          </ol>
          <Muted>Write them on paper, in order, and keep it somewhere safe. Don’t screenshot them.</Muted>
          <Button onClick={() => setStage('confirm')}>I’ve written them down</Button>
        </Card>
      )}

      {stage === 'confirm' && pending && (
        <Card title="Check three words">
          {asked.map((i) => (
            <label key={i} className="flex items-center gap-3 text-sm">
              <span className="w-16">Word {i + 1}</span>
              <input
                aria-label={`Word ${i + 1}`}
                autoCapitalize="none"
                autoComplete="off"
                value={answers[i] ?? ''}
                onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
                className="flex-1 rounded-lg px-3 py-2"
                style={{ background: 'var(--surface)', color: 'var(--ink)' }}
              />
            </label>
          ))}
          <div className="flex gap-2">
            <Button kind="quiet" onClick={() => setStage('show')}>Show words again</Button>
            <Button disabled={!correct || busy} onClick={save}>{busy ? 'Saving…' : 'Finish'}</Button>
          </div>
        </Card>
      )}

      {!pending && !error && <Muted>Creating your data key…</Muted>}
      <ErrorText>{error}</ErrorText>
    </Page>
  );
}
