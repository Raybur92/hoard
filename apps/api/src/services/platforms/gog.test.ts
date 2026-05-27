import {
  getGogAuthUrl,
  exchangeGogCode,
  refreshGogToken,
  computeExpiresAt,
  ensureFreshGogCredentials,
  syncGogLibrary,
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

describe('ensureFreshGogCredentials', () => {
  it('returns the SAME object when the token has not expired (identity check)', async () => {
    const creds = {
      accessToken: 'AT',
      refreshToken: 'RT',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min future
    };
    const fresh = await ensureFreshGogCredentials(creds);
    expect(fresh).toBe(creds); // referential equality — caller's `if (fresh !== creds)` short-circuit
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refreshes when the token is expired and returns a NEW object', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ access_token: 'AT-new', refresh_token: 'RT-new', expires_in: 3600 }),
    );

    const stale = {
      accessToken: 'AT-old',
      refreshToken: 'RT-old',
      expiresAt: new Date(Date.now() - 60 * 1000).toISOString(), // 1 min past
    };
    const fresh = await ensureFreshGogCredentials(stale);

    expect(fresh).not.toBe(stale); // different object → caller persists
    expect(fresh.accessToken).toBe('AT-new');
    expect(fresh.refreshToken).toBe('RT-new'); // GOG rotates refresh token — new value MUST persist
    expect(new Date(fresh.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('throws when refresh fails (refresh token revoked — user must reconnect via OAuth)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notOk(400, '{"error":"invalid_grant"}'));
    const stale = {
      accessToken: 'AT',
      refreshToken: 'RT-revoked',
      expiresAt: new Date(0).toISOString(),
    };
    await expect(ensureFreshGogCredentials(stale)).rejects.toThrow(/refresh failed.*400/);
  });
});

describe('syncGogLibrary', () => {
  function makeProduct(id: number, title: string, overrides: Record<string, unknown> = {}) {
    return { id, title, gameType: 'game', isHidden: false, ...overrides };
  }

  function pageResponse(products: unknown[], totalPages: number, page: number) {
    return ok({ products, totalPages, totalProducts: products.length, page });
  }

  const FRESH_CREDS = {
    accessToken: 'AT',
    refreshToken: 'RT',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };

  it('fetches page 1 and maps products into SyncedGame[] with platformCode=GG + gogAppId', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(pageResponse(
      [
        makeProduct(1207658691, 'The Witcher 3: Wild Hunt'),
        makeProduct(1207662223, 'Cyberpunk 2077'),
      ],
      1,
      1,
    ));

    const out = await syncGogLibrary(FRESH_CREDS);

    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      igdbSearchTitle: 'The Witcher 3: Wild Hunt',
      gogAppId: 1207658691,
      platformCode: 'GG',
      playtimeMinutes: 0,
      lastPlayedAt: null,
    });
    expect(out[1]?.gogAppId).toBe(1207662223);
  });

  it('paginates across multiple pages and concatenates products', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(pageResponse([makeProduct(1, 'A'), makeProduct(2, 'B')], 3, 1))
      .mockResolvedValueOnce(pageResponse([makeProduct(3, 'C'), makeProduct(4, 'D')], 3, 2))
      .mockResolvedValueOnce(pageResponse([makeProduct(5, 'E')], 3, 3));

    const out = await syncGogLibrary(FRESH_CREDS);

    expect(out.map((g) => g.igdbSearchTitle)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('sends Authorization: Bearer header on each request', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(pageResponse([], 1, 1));

    await syncGogLibrary({ ...FRESH_CREDS, accessToken: 'my-token' });

    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[0]).toContain('embed.gog.com/account/getFilteredProducts');
    expect(call[0]).toContain('mediaType=1');
    expect(call[0]).toContain('hiddenFlag=0');
    expect((call[1] as RequestInit).headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer my-token' }),
    );
  });

  it('drops non-Game products (DLC, packs, movies)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(pageResponse(
      [
        makeProduct(1, 'A Real Game'),
        makeProduct(2, 'A DLC', { gameType: 'dlc' }),
        makeProduct(3, 'A Pack', { gameType: 'pack' }),
        makeProduct(4, 'A Movie', { gameType: 'movie' }),
      ],
      1,
      1,
    ));

    const out = await syncGogLibrary(FRESH_CREDS);
    expect(out).toHaveLength(1);
    expect(out[0]?.igdbSearchTitle).toBe('A Real Game');
  });

  it('drops hidden products (defensive — hiddenFlag=0 query also filters them server-side)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(pageResponse(
      [
        makeProduct(1, 'Visible'),
        makeProduct(2, 'Hidden Game', { isHidden: true }),
      ],
      1,
      1,
    ));

    const out = await syncGogLibrary(FRESH_CREDS);
    expect(out).toHaveLength(1);
    expect(out[0]?.igdbSearchTitle).toBe('Visible');
  });

  it('drops products missing id or title (defensive — drift guard)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(pageResponse(
      [
        { title: 'No ID' },
        { id: 100, title: '' },
        { id: 200, title: 'OK' },
        { id: 0, title: 'Zero ID' },
      ],
      1,
      1,
    ));

    const out = await syncGogLibrary(FRESH_CREDS);
    expect(out).toHaveLength(1);
    expect(out[0]?.gogAppId).toBe(200);
  });

  it('throws with a refresh-hint message on 401 (caller should ensureFreshGogCredentials first)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(notOk(401, '(unauthorized)'));
    await expect(syncGogLibrary(FRESH_CREDS)).rejects.toThrow(/401.*token expired/);
  });

  it('throws on non-2xx HTTP that is NOT 401', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(notOk(503, 'service unavailable'));
    await expect(syncGogLibrary(FRESH_CREDS)).rejects.toThrow(/503/);
  });

  it('throws when the access token is missing', async () => {
    await expect(syncGogLibrary({ ...FRESH_CREDS, accessToken: '' })).rejects.toThrow(/access token missing/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws on malformed JSON from the API', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => { throw new Error('parse error'); },
    } as unknown as Response);
    await expect(syncGogLibrary(FRESH_CREDS)).rejects.toThrow(/malformed/i);
  });

  it('throws on a network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(syncGogLibrary(FRESH_CREDS)).rejects.toThrow(/network error/i);
  });
});
