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

// Google Identity Services, only when Google sign-in is configured
// (https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid#content_security_policy).
const GOOGLE = {
  script: 'https://accounts.google.com/gsi/client',
  style: 'https://accounts.google.com/gsi/style',
  frame: 'https://accounts.google.com/gsi/',
  connect: 'https://accounts.google.com/gsi/',
};

export function headersFile(gatewayUrl, { google = false } = {}) {
  const g = (key) => (google ? ` ${GOOGLE[key]}` : '');
  // connect-src is the load-bearing line, as in the offline app: this origin and
  // the gateway, nothing else, so a decrypted record can't be sent anywhere.
  // 'unsafe-inline' for scripts: Next's static export inlines its bootstrap
  // and there is no server to mint a nonce (same trade-off as webapp/).
  // 'wasm-unsafe-eval' lets libsodium (sealed boxes, Argon2id) compile its
  // WebAssembly; it does not allow eval() of JavaScript.
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${g('script')}`,
    `style-src 'self' 'unsafe-inline'${g('style')}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${gatewayOrigin(gatewayUrl)}${g('connect')}`,
    ...(google ? [`frame-src ${GOOGLE.frame}`] : []),
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
