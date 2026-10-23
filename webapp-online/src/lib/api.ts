// The gateway client. Every request is DPoP-signed with this device's key; the
// access token is kept in memory and refreshed (rotating the refresh token)
// when it expires or the server says it is no longer valid.
import { createDeviceKey, createProof, thumbprint, type DeviceKey } from './dpop';
import { createPasskey, getPasskey } from './passkey';
import * as vault from './vault';

export const PLATFORM = 'web';

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  user_id: string;
  device_id: string;
};

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
  }
}

type Deps = { fetch: typeof fetch; now: () => number; vault: typeof vault };

export class GatewayClient {
  private access: { token: string; expiresAt: number } | undefined;
  private key: DeviceKey | undefined;

  constructor(
    readonly baseUrl: string,
    private readonly deps: Deps = { fetch: (...a) => fetch(...a), now: Date.now, vault },
  ) {}

  private async deviceKey(): Promise<DeviceKey> {
    if (this.key) return this.key;
    this.key = (await this.deps.vault.loadKey()) ?? (await createDeviceKey());
    await this.deps.vault.saveKey(this.key);
    return this.key;
  }

  private async send(method: string, path: string, body: unknown, accessToken?: string): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      DPoP: await createProof(await this.deviceKey(), method, url, accessToken, this.deps.now),
    };
    if (accessToken !== undefined) headers.Authorization = `DPoP ${accessToken}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return this.deps.fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  }

  private static async fail(response: Response): Promise<never> {
    const problem = await response.json().catch(() => ({}) as Record<string, unknown>);
    const code = typeof problem.error === 'string' ? problem.error : undefined;
    throw new ApiError(response.status, code, `${response.status}${code ? ` ${code}` : ''}`);
  }

  private async keep(tokens: TokenResponse): Promise<TokenResponse> {
    this.access = { token: tokens.access_token, expiresAt: this.deps.now() + tokens.expires_in * 1000 };
    await this.deps.vault.saveSession({
      refreshToken: tokens.refresh_token, userId: tokens.user_id, deviceId: tokens.device_id,
    });
    return tokens;
  }

  /** Signs in with a provider's ID token (`dev` is the development provider). */
  async signIn(provider: string, idToken: string): Promise<TokenResponse> {
    const response = await this.send('POST', '/v1/auth/token', { provider, platform: PLATFORM, id_token: idToken });
    if (!response.ok) return GatewayClient.fail(response);
    return this.keep((await response.json()) as TokenResponse);
  }

  private async challenge(path: string): Promise<{ challenge_id: string; options: Record<string, unknown> }> {
    const response = await this.send('POST', path, undefined);
    if (!response.ok) return GatewayClient.fail(response);
    return response.json();
  }

  private async tokenWith(body: Record<string, unknown>): Promise<TokenResponse> {
    const response = await this.send('POST', '/v1/auth/token', { platform: PLATFORM, ...body });
    if (!response.ok) return GatewayClient.fail(response);
    return this.keep((await response.json()) as TokenResponse);
  }

  /** Creates an account with a new passkey (Face ID / Touch ID / device PIN) and signs in. */
  async signUpWithPasskey(): Promise<TokenResponse> {
    const { challenge_id, options } = await this.challenge('/v1/auth/passkeys/signup/options');
    const attestation = await createPasskey(options);
    return this.tokenWith({ provider: 'passkey_signup', challenge_id, attestation });
  }

  /** Signs in with a passkey this site already has on this device (or a nearby phone). */
  async signInWithPasskey(): Promise<TokenResponse> {
    const { challenge_id, options } = await this.challenge('/v1/auth/passkeys/assert/options');
    const assertion = await getPasskey(options);
    return this.tokenWith({ provider: 'passkey', challenge_id, assertion });
  }

  /**
   * This device's DPoP key thumbprint (RFC 7638). Google sign-in puts it in the
   * ID token as the nonce, and Identity refuses a token whose nonce isn't the
   * key that signs the request, so a token lifted from this page is useless
   * to any other device.
   */
  async dpopThumbprint(): Promise<string> {
    return thumbprint((await this.deviceKey()).publicJwk);
  }

  /** Signs in (or creates the account) with a Google ID token minted for this device's key. */
  async signInWithGoogle(idToken: string): Promise<TokenResponse> {
    return this.tokenWith({ provider: 'google', id_token: idToken });
  }

  async isSignedIn(): Promise<boolean> {
    return (await this.deps.vault.loadSession()) !== undefined;
  }

  private async refresh(): Promise<string> {
    const session = await this.deps.vault.loadSession();
    if (!session) throw new ApiError(401, 'signed_out', 'Not signed in.');
    const response = await this.send('POST', '/v1/auth/refresh', { refresh_token: session.refreshToken });
    if (!response.ok) {
      // A refused refresh (revoked, reused or expired) ends this session here too.
      await this.deps.vault.clearSession();
      this.access = undefined;
      return GatewayClient.fail(response);
    }
    return (await this.keep((await response.json()) as TokenResponse)).access_token;
  }

  private async accessToken(): Promise<string> {
    // Renew a little early, so a token never expires in flight.
    if (this.access && this.access.expiresAt - 30_000 > this.deps.now()) return this.access.token;
    return this.refresh();
  }

  /** A signed-in call. One retry after a refresh if the token was refused. */
  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response = await this.send(method, path, body, await this.accessToken());
    if (response.status === 401) {
      this.access = undefined;
      response = await this.send(method, path, body, await this.refresh());
    }
    if (!response.ok) return GatewayClient.fail(response);
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  async signOut(everywhere = false): Promise<void> {
    try {
      await this.call('POST', '/v1/auth/logout', { everywhere });
    } finally {
      this.access = undefined;
      await this.deps.vault.clearSession();
    }
  }
}

/** The gateway this build talks to, fixed at build time. */
export const gatewayUrl = (process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:5196').replace(/\/$/, '');

let client: GatewayClient | undefined;
export const gateway = () => (client ??= new GatewayClient(gatewayUrl));
