import {
  getGogAuthUrl,
  exchangeGogCode,
  refreshGogToken,
  computeExpiresAt,
  GOG_GALAXY_REDIRECT_URI,
} from './gog';

beforeEach(() => {
  process.env['GOG_CLIENT_ID'] = 'fake-client-id';
  process.env['GOG_CLIENT_SECRET'] = 'fake-client-secret';
  global.fetch = jest.fn() as typeof global.fetch;
});

afterEach(() => {
  delete process.env['GOG_CLIENT_ID'];
  delete process.env['GOG_CLIENT_SECRET'];
});

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

function notOk(status = 400, body = '(error)'): Response {
  return { ok: false, status, json: async () => ({}), text: async () => body } as unknown as Response;
}

describe('getGogAuthUrl', () => {
  it('builds the GOG auth URL with the Galaxy redirect URI hardcoded', () => {
    const url = getGogAuthUrl();
    expect(url).toContain('https://auth.gog.com/auth?');
    expect(url).toContain('client_id=fake-client-id');
    expect(url).toContain('response_type=code');
    expect(url).toContain('layout=client2');
    expect(url).toContain(encodeURIComponent(GOG_GALAXY_REDIRECT_URI));
  });

  it('throws when GOG_CLIENT_ID env var is missing', () => {
    delete process.env['GOG_CLIENT_ID'];
    expect(() => getGogAuthUrl()).toThrow(/GOG_CLIENT_ID/);
  });
});

describe('exchangeGogCode', () => {
  it('POSTs to auth.gog.com/token with the authorization_code grant', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }),
    );

    const result = await exchangeGogCode('auth-code-123');

    expect(result).toEqual({ accessToken: 'AT', refreshToken: 'RT', expiresIn: 3600 });

    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[0]).toBe('https://auth.gog.com/token');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(
      expect.objectContaining({ 'Content-Type': 'application/x-www-form-urlencoded' }),
    );
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code-123');
    expect(body.get('client_id')).toBe('fake-client-id');
    expect(body.get('client_secret')).toBe('fake-client-secret');
    expect(body.get('redirect_uri')).toBe(GOG_GALAXY_REDIRECT_URI);
  });

  it('throws with status + body excerpt on non-2xx (codes are single-use; this is the common failure)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notOk(400, '{"error":"invalid_grant"}'));
    await expect(exchangeGogCode('stale-code')).rejects.toThrow(/400.*invalid_grant/);
  });

  it('throws when GOG_CLIENT_SECRET is missing', async () => {
    delete process.env['GOG_CLIENT_SECRET'];
    await expect(exchangeGogCode('any')).rejects.toThrow(/GOG_CLIENT_SECRET/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('refreshGogToken', () => {
  it('POSTs to auth.gog.com/token with the refresh_token grant', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ access_token: 'AT-new', refresh_token: 'RT-new', expires_in: 3600 }),
    );

    const result = await refreshGogToken('RT-old');

    // GOG returns a NEW refresh token on every refresh — caller must persist it.
    expect(result).toEqual({ accessToken: 'AT-new', refreshToken: 'RT-new', expiresIn: 3600 });

    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('RT-old');
    expect(body.get('client_id')).toBe('fake-client-id');
  });

  it('throws on a refresh failure (refresh token revoked / expired — user must reconnect)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notOk(400, '{"error":"invalid_grant"}'));
    await expect(refreshGogToken('expired-rt')).rejects.toThrow(/400.*invalid_grant/);
  });
});

describe('computeExpiresAt', () => {
  it('returns an ISO 8601 timestamp ~expiresIn seconds in the future (60s safety margin)', () => {
    const before = Date.now();
    const iso = computeExpiresAt(3600);
    const after = Date.now();
    const expiry = new Date(iso).getTime();
    // 3600s - 60s safety = 3540s from "now"
    expect(expiry).toBeGreaterThanOrEqual(before + 3540 * 1000);
    expect(expiry).toBeLessThanOrEqual(after + 3540 * 1000);
  });

  it('handles very-short-lived tokens by clamping to a valid ISO string', () => {
    const iso = computeExpiresAt(0);
    // Subtracts 60s margin so expiry is in the past. That's fine — caller's
    // "is this token expired" check will fire and trigger a refresh.
    expect(typeof iso).toBe('string');
    expect(() => new Date(iso).toISOString()).not.toThrow();
  });
});
