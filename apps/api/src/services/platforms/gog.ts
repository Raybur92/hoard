import type { SyncedGame } from './steam';

export interface GogCredentials {
  accessToken: string;
  refreshToken?: string;
}

export interface GogOAuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const GOG_CLIENT_ID = process.env['GOG_CLIENT_ID'] ?? '';
const GOG_CLIENT_SECRET = process.env['GOG_CLIENT_SECRET'] ?? '';

export function getGogAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: GOG_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    layout: 'client2',
  });
  return `https://auth.gog.com/auth?${params.toString()}`;
}

export async function exchangeGogCode(code: string, redirectUri: string): Promise<GogOAuthResult> {
  const res = await fetch('https://auth.gog.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOG_CLIENT_ID,
      client_secret: GOG_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });
  if (!res.ok) throw new Error(`GOG token exchange failed: ${res.status}`);
  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
}

export async function syncGogLibrary(_credentials: GogCredentials): Promise<SyncedGame[]> {
  // GOG community OAuth — undocumented API, treat as fragile.
  // Implementation deferred — degrade gracefully to manual add if this breaks.
  return [] as SyncedGame[];
}

export { SyncedGame };
