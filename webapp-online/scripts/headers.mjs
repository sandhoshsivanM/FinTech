// Response headers for Khazana Online's static build. The CSP must name the
// gateway this build talks to, and that is only known at build time
// (NEXT_PUBLIC_GATEWAY_URL), so the headers are generated, not hand-written.

/** The gateway's origin, refusing anything that is not a bare http(s) origin. */
export function gatewayOrigin(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && u.hostname === 'localhost')) {
    throw new Error(`NEXT_PUBLIC_GATEWAY_URL must be https (or http://localhost): ${url}`);
  }
  return u.origin;
}

export function headersFile(gatewayUrl) {
  // connect-src is the load-bearing line, as in the offline app: this origin and
  // the gateway, nothing else, so a decrypted record can't be sent anywhere.
  // 'unsafe-inline' for scripts: Next's static export inlines its bootstrap
  // and there is no server to mint a nonce (same trade-off as webapp/).
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${gatewayOrigin(gatewayUrl)}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self'",
  ].join('; ');
  return `/_next/static/*
  Cache-Control: public, max-age=31536000, immutable

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
`;
}
