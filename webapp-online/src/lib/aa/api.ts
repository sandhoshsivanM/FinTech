// The Account Aggregator service's API (contracts/openapi/accountaggregator.json),
// and the shape of what arrives sealed in the inbox (FiBundle, aa.fi-bundle.v1).
// Money is a decimal string everywhere; dates are ISO 8601.
import { fromUtf8, toBase64 } from '../crypto/bytes';
import { ready } from '../crypto/e2e';
import type { DeliveryKey } from './deliveryKeys';

type Gateway = { call<T>(method: string, path: string, body?: unknown): Promise<T> };

export type ConsentStatus = 'pending' | 'active' | 'paused' | 'revoked' | 'expired' | 'rejected';

export type Consent = {
  id: string;
  status: ConsentStatus;
  fi_types: string[];
  frequency: string;
  data_from: string;
  data_to: string;
  expires_at: string;
  created_at: string;
  activated_at: string | null;
  last_fetched_at: string | null;
  next_fetch_at: string | null;
  redirect_url: string | null;
  provider: string;
};

export type ProviderInfo = { provider: string; sample: boolean; needs_aa_handle: boolean; fi_types: string[] };

export type FetchView = {
  saga_id: string | null;
  state: string;
  started: boolean;
  attempt: number;
  error_code: string | null;
  last_fetched_at: string | null;
};

export type InboxItem = {
  id: string;
  kind: string;
  consent_id: string;
  alg: string;
  sealed_payload: string;
  created_at: string;
  expires_at: string;
};

export const FI_BUNDLE_KIND = 'aa.fi-bundle.v1';
export const SEALED_ALG = 'x25519-sealedbox-v1';

export type DepositTxn = {
  txn_id: string; type: 'CREDIT' | 'DEBIT'; mode: string; amount: string; balance_after: string;
  at: string; value_date: string; narration: string; reference: string;
};
export type DepositAccount = {
  link_ref: string; fip_id: string; fip_name: string; masked_account_number: string; account_type: string;
  ifsc: string | null; currency: string; current_balance: string; balance_at: string; transactions: DepositTxn[];
};
export type TermDeposit = {
  link_ref: string; fip_id: string; fip_name: string; masked_account_number: string; kind: 'TERM' | 'RECURRING';
  principal: string; interest_rate: string; opened_on: string; matures_on: string; maturity_amount: string;
  current_value: string; monthly_instalment: string | null;
};
export type FundHolding = {
  isin: string; scheme_code: string; scheme_name: string; units: string; nav: string; nav_date: string;
  cost_value: string; current_value: string;
};
export type FundFolio = { link_ref: string; fip_id: string; fip_name: string; masked_folio: string; holdings: FundHolding[] };
export type EquityHolding = {
  isin: string; symbol: string; issuer_name: string; exchange: string; kind: 'EQUITY' | 'ETF';
  units: string; last_price: string; current_value: string;
};
export type Demat = { link_ref: string; fip_id: string; fip_name: string; masked_demat_id: string; holdings: EquityHolding[] };
export type Nps = { link_ref: string; fip_id: string; fip_name: string; masked_pran: string; tier: string; total_value: string; as_of: string };
export type Retirement = {
  link_ref: string; fip_id: string; fip_name: string; kind: 'EPF' | 'PPF'; masked_number: string; establishment: string | null;
  employee_share: string | null; employer_share: string | null; pension_share: string | null; total_balance: string; as_of: string;
};
export type Policy = {
  link_ref: string; fip_id: string; fip_name: string; masked_policy_number: string; policy_type: string; plan_name: string;
  sum_assured: string; premium: string; premium_frequency: string; started_on: string; next_premium_due: string | null;
  matures_on: string | null;
};

export type FiBundle = {
  schema: string;
  consent_id: string;
  fetched_at: string;
  from: string;
  to: string;
  deposits: DepositAccount[];
  term_deposits: TermDeposit[];
  mutual_funds: FundFolio[];
  equities: Demat[];
  nps: Nps[];
  retirement: Retirement[];
  insurance: Policy[];
};

export class PayloadError extends Error {}

/**
 * Opens one inbox payload on this device. Tries every delivery key (the ring),
 * then checks the envelope names this very payload and kind, so a server that
 * swapped two payloads, or replayed another user's, is caught.
 */
export async function openPayload(item: InboxItem, ring: DeliveryKey[]): Promise<FiBundle> {
  if (item.alg !== SEALED_ALG || item.kind !== FI_BUNDLE_KIND) throw new PayloadError(`Unsupported payload ${item.kind}/${item.alg}.`);
  const s = await ready();
  const sealed = Uint8Array.from(atob(item.sealed_payload), (c) => c.charCodeAt(0));
  let plain: Uint8Array | undefined;
  for (const key of ring) {
    try {
      plain = s.crypto_box_seal_open(sealed, key.publicKey, key.privateKey);
      break;
    } catch {
      // Not this key.
    }
  }
  if (!plain) throw new PayloadError('No delivery key on this device opens this payload.');
  let envelope: { payload_id?: unknown; kind?: unknown; data?: FiBundle };
  try {
    envelope = JSON.parse(fromUtf8(plain));
  } finally {
    plain.fill(0);
  }
  if (envelope.payload_id !== item.id || envelope.kind !== item.kind || !envelope.data) {
    throw new PayloadError('The payload is not the one the inbox listed.');
  }
  if (envelope.data.consent_id !== item.consent_id) throw new PayloadError('The payload belongs to another consent.');
  return envelope.data;
}

export class AaClient {
  constructor(private readonly gateway: Gateway) {}

  provider = () => this.gateway.call<ProviderInfo>('GET', '/v1/aa/provider');
  list = () => this.gateway.call<Consent[]>('GET', '/v1/aa/consents');
  get = (id: string) => this.gateway.call<Consent>('GET', `/v1/aa/consents/${encodeURIComponent(id)}`);
  revoke = (id: string) => this.gateway.call<void>('DELETE', `/v1/aa/consents/${encodeURIComponent(id)}`);
  fetch = (consentId: string) => this.gateway.call<FetchView>('POST', '/v1/aa/fetch', { consent_id: consentId });
  fetchStatus = (sagaId: string) => this.gateway.call<FetchView>('GET', `/v1/aa/fetch/${encodeURIComponent(sagaId)}`);
  inbox = () => this.gateway.call<InboxItem[]>('GET', '/v1/aa/inbox');
  ack = (payloadId: string) => this.gateway.call<void>('POST', `/v1/aa/inbox/${encodeURIComponent(payloadId)}/ack`);

  /** Only the PUBLIC half of the delivery key leaves the device. */
  create(input: { fiTypes: string[]; deliveryPublicKey: Uint8Array; aaHandle?: string }) {
    return this.gateway.call<Consent>('POST', '/v1/aa/consents', {
      fi_types: input.fiTypes,
      delivery_key: toBase64(input.deliveryPublicKey),
      ...(input.aaHandle ? { aa_handle: input.aaHandle } : {}),
    });
  }
}
