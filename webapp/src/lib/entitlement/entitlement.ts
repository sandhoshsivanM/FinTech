/**
 * The web twin of `lib/domain/entitlement/entitlement.dart`.
 *
 * Names match the Dart side exactly. They are two implementations of one
 * contract, and the moment the vocabulary diverges the two clients start
 * disagreeing about what a customer bought.
 */

/** Where a Pro unlock came from. */
export type ProSource =
  | 'none'
  /** StoreKit non-consumable. Never produced by this client; only read from a
   *  backup written by the mobile app. */
  | 'appStore'
  | 'playStore'
  /** Ed25519-signed licence key — how the web and desktop builds unlock. */
  | 'licenseKey'
  | 'devOverride';

export interface Entitlement {
  isPro: boolean;
  source: ProSource;
  /** ISO date the purchase or licence was first seen on this device. */
  grantedAt?: string;
  lastVerifiedAt?: string;
  /**
   * 16 hex chars — the first 8 bytes of SHA-256 over the merchant order id.
   * Display only, and deliberately a hash: the paywall can say
   * "Licence …4F2A" while the client holds no personal data about the buyer.
   */
  orderRef?: string;
}

export const FREE: Entitlement = { isPro: false, source: 'none' };

/**
 * Parses a stored entitlement, tolerating anything.
 *
 * This runs during `init()`, before the first paint. A throw here is a blank
 * app, so a cache written by a newer build — or half-written by a crash — must
 * degrade to Free rather than take the page down.
 */
export function parseEntitlement(raw: string | null): Entitlement {
  if (!raw) return FREE;
  try {
    const o = JSON.parse(raw) as Partial<Entitlement>;
    if (o?.isPro !== true) return FREE;
    return {
      isPro: true,
      source: (o.source ?? 'none') as ProSource,
      grantedAt: typeof o.grantedAt === 'string' ? o.grantedAt : undefined,
      lastVerifiedAt:
        typeof o.lastVerifiedAt === 'string' ? o.lastVerifiedAt : undefined,
      orderRef: typeof o.orderRef === 'string' ? o.orderRef : undefined,
    };
  } catch {
    return FREE;
  }
}

/** The last four characters of the order reference, for display. */
export function shortRef(e: Entitlement): string | null {
  return e.orderRef ? e.orderRef.slice(-4) : null;
}
