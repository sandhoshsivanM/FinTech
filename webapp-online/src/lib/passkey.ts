// WebAuthn ceremonies: the server's JSON options → navigator.credentials →
// the standard JSON answer (what PublicKeyCredential.toJSON() returns). Uses
// the browser's own JSON helpers where it has them (Chrome, Firefox, Safari
// 18.4+) and converts by hand where it doesn't.
import { fromBase64 } from './crypto/bytes';

type Json = Record<string, unknown>;

const b64url = (buf: ArrayBuffer) => {
  let binary = '';
  for (const b of new Uint8Array(buf)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const bytes = (s: string) => fromBase64(s) as Uint8Array<ArrayBuffer>;

type WithJson = typeof PublicKeyCredential & {
  parseCreationOptionsFromJSON?: (o: Json) => PublicKeyCredentialCreationOptions;
  parseRequestOptionsFromJSON?: (o: Json) => PublicKeyCredentialRequestOptions;
};
const PKC = () => (typeof PublicKeyCredential === 'undefined' ? undefined : (PublicKeyCredential as WithJson));

export const passkeysSupported = () => PKC() !== undefined && !!navigator.credentials?.create;

const descriptors = (list: unknown) =>
  ((list as Json[] | undefined) ?? []).map((d) => ({ ...d, id: bytes(d.id as string) }) as unknown as PublicKeyCredentialDescriptor);

function creationOptions(o: Json): PublicKeyCredentialCreationOptions {
  const parse = PKC()?.parseCreationOptionsFromJSON;
  if (parse) return parse(o);
  const user = o.user as Json;
  return {
    ...(o as unknown as PublicKeyCredentialCreationOptions),
    challenge: bytes(o.challenge as string),
    user: { ...(user as unknown as PublicKeyCredentialUserEntity), id: bytes(user.id as string) },
    excludeCredentials: descriptors(o.excludeCredentials),
  };
}

function requestOptions(o: Json): PublicKeyCredentialRequestOptions {
  const parse = PKC()?.parseRequestOptionsFromJSON;
  if (parse) return parse(o);
  return {
    ...(o as unknown as PublicKeyCredentialRequestOptions),
    challenge: bytes(o.challenge as string),
    allowCredentials: descriptors(o.allowCredentials),
  };
}

function toJson(credential: PublicKeyCredential): Json {
  const own = (credential as PublicKeyCredential & { toJSON?: () => Json }).toJSON;
  if (own) return own.call(credential);
  const r = credential.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse;
  const response: Json = { clientDataJSON: b64url(r.clientDataJSON) };
  if ('attestationObject' in r && r.attestationObject) {
    response.attestationObject = b64url(r.attestationObject);
    response.transports = r.getTransports?.() ?? [];
  } else {
    response.authenticatorData = b64url(r.authenticatorData);
    response.signature = b64url(r.signature);
    if (r.userHandle) response.userHandle = b64url(r.userHandle);
  }
  return {
    id: credential.id,
    rawId: b64url(credential.rawId),
    type: credential.type,
    response,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
  };
}

/** Creates a passkey (Face ID / Touch ID / device PIN). Returns the attestation JSON. */
export async function createPasskey(options: Json): Promise<Json> {
  const credential = (await navigator.credentials.create({ publicKey: creationOptions(options) })) as PublicKeyCredential | null;
  if (!credential) throw new PasskeyCancelled();
  return toJson(credential);
}

/** Signs in with any passkey for this site on this device. Returns the assertion JSON. */
export async function getPasskey(options: Json): Promise<Json> {
  const credential = (await navigator.credentials.get({ publicKey: requestOptions(options) })) as PublicKeyCredential | null;
  if (!credential) throw new PasskeyCancelled();
  return toJson(credential);
}

export class PasskeyCancelled extends Error {
  constructor() {
    super('The passkey prompt was closed.');
  }
}
