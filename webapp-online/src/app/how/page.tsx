'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { decryptRecord } from '@/lib/crypto/e2e';
import { keys } from '@/lib/account';
import { useOnline } from '@/lib/store';
import { useReady } from '@/lib/useReady';
import { records, type LocalRecord } from '@/lib/vault';
import { Card, LiveStatus, Muted, Page } from '@/components/ui';

type Row = { record: LocalRecord; plain?: unknown };

const hex = (b: Uint8Array | null, n = 24) => (b ? [...b.slice(0, n)].map((x) => x.toString(16).padStart(2, '0')).join('') + (b.length > n ? '…' : '') : '—');

/**
 * What the server stores for this account, next to what only this device can
 * read. The left column is exactly what was sent; the right needs the data key.
 */
export default function HowItWorks() {
  const { ready } = useReady();
  const { ledger } = useOnline();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const all = (await records.all()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setRows(await Promise.all(all.map(async (record) => ({
        record,
        plain: record.ciphertext
          ? await decryptRecord(keys().dataKey, { recordId: record.recordId, collection: record.collection, keyVersion: record.keyVersion }, record.ciphertext).catch(() => undefined)
          : undefined,
      }))));
    })();
  }, [ready, ledger]);

  return (
    <Page title="How it works" lead="Everything you add is encrypted on this device with your data key before it is sent. The server stores the left column; only your devices can produce the right one.">
      <Link href="/dashboard/" className="inline-flex min-h-6 items-center text-sm" style={{ color: "var(--muted)" }}>← Dashboard</Link>
      <Card title="Your data key">
        <Muted>
          Created on your first device and never sent anywhere in readable form. Each of your devices holds a copy sealed to its own key;
          your 24-word phrase holds another. The server keeps those sealed copies, which it cannot open.
        </Muted>
      </Card>
      {rows.map(({ record, plain }) => (
        <Card key={`${record.collection}/${record.recordId}`}>
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <p className="mb-1 font-medium">What the server stores</p>
              <p style={{ color: 'var(--muted)' }}>{record.collection} · {record.recordId.slice(0, 8)}… · {record.ciphertext?.length ?? 0} bytes · {new Date(record.updatedAt).toLocaleString()}</p>
              <code className="break-all" data-testid="ciphertext">{record.deleted ? 'deleted (no content)' : hex(record.ciphertext)}</code>
            </div>
            <div>
              <p className="mb-1 font-medium">What this device reads</p>
              <code className="break-all" data-testid="plaintext">{record.deleted ? '—' : JSON.stringify(plain)}</code>
            </div>
          </div>
        </Card>
      ))}
      <LiveStatus>{ready && rows.length === 0 ? 'Add an account first.' : ''}</LiveStatus>
    </Page>
  );
}
