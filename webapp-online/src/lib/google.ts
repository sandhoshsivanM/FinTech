// Google sign-in with Google Identity Services (GIS). The button gives us an ID
// token; its nonce is this device's DPoP key thumbprint, so Identity accepts
// it only from this device (IdTokenVerifiers.cs).

export const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

type Gis = {
  accounts: {
    id: {
      initialize(options: { client_id: string; nonce: string; callback: (r: { credential: string }) => void; use_fedcm_for_prompt?: boolean; ux_mode?: 'popup' }): void;
      renderButton(el: HTMLElement, options: Record<string, unknown>): void;
    };
  };
};

let loading: Promise<Gis> | undefined;

function loadGis(): Promise<Gis> {
  loading ??= new Promise<Gis>((resolve, reject) => {
    const existing = (window as unknown as { google?: Gis }).google;
    if (existing?.accounts) return resolve(existing);
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve((window as unknown as { google: Gis }).google);
    script.onerror = () => {
      loading = undefined;
      reject(new Error('Google sign-in could not load. Check your connection.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Draws Google's button into `el`; `onToken` receives the ID token when the user signs in. */
export async function renderGoogleButton(el: HTMLElement, nonce: string, onToken: (idToken: string) => void): Promise<void> {
  const gis = await loadGis();
  gis.accounts.id.initialize({
    client_id: googleClientId,
    nonce,
    callback: (r) => onToken(r.credential),
    use_fedcm_for_prompt: true,
    ux_mode: 'popup',
  });
  gis.accounts.id.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: 320 });
}
