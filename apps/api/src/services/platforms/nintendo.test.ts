import {
  generateNintendoPkce,
  getNintendoAuthUrl,
  extractSessionTokenCode,
  exchangeNintendoSessionTokenCode,
  exchangeNintendoAccessToken,
  ensureFreshNintendoCredentials,
  computeExpiresAt,
  getNintendoAccountUser,
  getNintendoUsername,
  getNintendoDevices,
  getNintendoLatestMonthlySummary,
  syncNintendoLibrary,
} from './nintendo';

beforeEach(() => {
  jest.resetAllMocks();
  global.fetch = jest.fn() as typeof global.fetch;
});

function ok(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

function notOk(status: number, body: unknown = {}): Response {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

/* ── generateNintendoPkce + getNintendoAuthUrl ── */

describe('generateNintendoPkce', () => {
  it('produces a verifier ≥ 43 chars and a challenge that is its sha256 url-safe base64', () => {
    const { verifier, challenge } = generateNintendoPkce();
    // RFC 7636: verifier is 43-128 chars; we use 32 bytes → ~43 chars b64url.
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    // Two consecutive calls produce DIFFERENT verifiers (randomness).
    const second = generateNintendoPkce();
    expect(second.verifier).not.toBe(verifier);
  });
});

describe('getNintendoAuthUrl', () => {
  it('builds an authorize URL with PKCE + state + scopes + the Parental Controls client id', () => {
    const url = getNintendoAuthUrl('CHALLENGE', 'STATE');
    expect(url).toContain('accounts.nintendo.com/connect/1.0.0/authorize');
    expect(url).toContain('state=STATE');
    expect(url).toContain('session_token_code_challenge=CHALLENGE');
    expect(url).toContain('session_token_code_challenge_method=S256');
    expect(url).toContain('response_type=session_token_code');
    expect(url).toContain('client_id=54789befb391a838');
    expect(url).toContain('redirect_uri=npf54789befb391a838');
  });
});

/* ── extractSessionTokenCode ── */

describe('extractSessionTokenCode', () => {
  it('extracts the code from a full npf://… redirect URL', () => {
    const url = 'npf54789befb391a838://auth#session_token_code=eyJhbGciOiJIUzI1NiJ9.abc.def&state=ST';
    expect(extractSessionTokenCode(url)).toBe('eyJhbGciOiJIUzI1NiJ9.abc.def');
  });

  it('accepts a bare code value (≥20 chars, url-safe set with dots)', () => {
    const code = 'eyJhbGciOiJIUzI1NiJ9.payload.signature';
    expect(extractSessionTokenCode(code)).toBe(code);
  });

  it('returns null for input without a code fragment or short bare strings', () => {
    expect(extractSessionTokenCode('')).toBeNull();
    expect(extractSessionTokenCode('   ')).toBeNull();
    expect(extractSessionTokenCode('not-a-url-at-all')).toBeNull();
    expect(extractSessionTokenCode('https://example.com/?foo=bar')).toBeNull();
  });

  it('handles ?session_token_code= as a query-string variant', () => {
    const url = 'https://example.com/redirect?session_token_code=eyJhbGc.abc.def123';
    expect(extractSessionTokenCode(url)).toBe('eyJhbGc.abc.def123');
  });
});

/* ── exchangeNintendoSessionTokenCode ── */

describe('exchangeNintendoSessionTokenCode', () => {
  it('exchanges code + verifier for a long-lived session_token', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({ session_token: 'ST-long-lived' }));
    const result = await exchangeNintendoSessionTokenCode('CODE', 'VERIFIER');
    expect(result).toBe('ST-long-lived');

    const init = (global.fetch as jest.Mock).mock.calls[0]![1] as RequestInit;
    expect(String(init.body)).toContain('session_token_code=CODE');
    expect(String(init.body)).toContain('session_token_code_verifier=VERIFIER');
    expect((init.headers as Record<string, string>)['Content-Type']).toContain('application/x-www-form-urlencoded');
  });

  it('throws on a 400 (stale/invalid code)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notOk(400, { error: 'invalid_grant' }));
    await expect(exchangeNintendoSessionTokenCode('stale', 'V')).rejects.toThrow(/400/);
  });

  it('throws when Nintendo returns a payload without session_token', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({}));
    await expect(exchangeNintendoSessionTokenCode('CODE', 'V')).rejects.toThrow(/session_token missing/);
  });
});

/* ── exchangeNintendoAccessToken + computeExpiresAt + ensureFreshNintendoCredentials ── */

describe('exchangeNintendoAccessToken', () => {
  it('exchanges session_token for a short-lived access_token (15-min TTL)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({ access_token: 'AT', id_token: 'IT', expires_in: 900 }));
    const result = await exchangeNintendoAccessToken('ST');
    expect(result.accessToken).toBe('AT');
    expect(result.idToken).toBe('IT');
    expect(result.expiresIn).toBe(900);

    const init = (global.fetch as jest.Mock).mock.calls[0]![1] as RequestInit;
    expect(String(init.body)).toContain('"session_token":"ST"');
    expect(String(init.body)).toContain('jwt-bearer-session-token');
    // Nintendo gates on Dalvik UA at this endpoint.
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('Dalvik');
  });

  it('throws when access_token response is incomplete', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({ access_token: 'AT' })); // no id_token, no expires_in
    await expect(exchangeNintendoAccessToken('ST')).rejects.toThrow(/incomplete/);
  });
});

describe('computeExpiresAt', () => {
  it('subtracts a 60-second safety margin', () => {
    const before = Date.now();
    const iso = computeExpiresAt(900);
    const t = new Date(iso).getTime();
    expect(t).toBeGreaterThanOrEqual(before + (900 - 60) * 1000 - 1000);
    expect(t).toBeLessThanOrEqual(before + (900 - 60) * 1000 + 1000);
  });
});

describe('ensureFreshNintendoCredentials', () => {
  it('returns the same object when both tokens are valid (identity equality)', async () => {
    const creds = {
      sessionToken: 'ST',
      accessToken: 'AT',
      idToken: 'IT',
      naId: 'NAID',
      expiresAt: new Date(Date.now() + 600 * 1000).toISOString(),
    };
    const fresh = await ensureFreshNintendoCredentials(creds);
    expect(fresh).toBe(creds);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refreshes both access_token + id_token; session_token + naId preserved', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({ access_token: 'AT-2', id_token: 'IT-2', expires_in: 900 }));
    const creds = {
      sessionToken: 'ST',
      accessToken: 'AT-1',
      idToken: 'IT-1',
      naId: 'NAID',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    const fresh = await ensureFreshNintendoCredentials(creds);
    expect(fresh).not.toBe(creds);
    expect(fresh.accessToken).toBe('AT-2');
    expect(fresh.idToken).toBe('IT-2');
    expect(fresh.sessionToken).toBe('ST');
    expect(fresh.naId).toBe('NAID');
  });

  it('force-refreshes when idToken is missing (legacy-row migration path)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({ access_token: 'AT-2', id_token: 'IT-fresh', expires_in: 900 }));
    // Legacy row: accessToken is still within its expiry window, but no
    // idToken was persisted by the pre-2026-05-29 connect code. Must
    // refresh anyway so subsequent Moon calls have an idToken to send.
    const creds = {
      sessionToken: 'ST',
      accessToken: 'AT-legacy',
      idToken: '',
      naId: 'NAID',
      expiresAt: new Date(Date.now() + 600 * 1000).toISOString(),
    };
    const fresh = await ensureFreshNintendoCredentials(creds);
    expect(fresh).not.toBe(creds);
    expect(fresh.idToken).toBe('IT-fresh');
    expect(fresh.accessToken).toBe('AT-2');
  });
});

/* ── getNintendoAccountUser + getNintendoUsername ── */

describe('getNintendoAccountUser', () => {
  it('returns the user object on a 200 response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({ id: 'NAID', nickname: 'AndreaC', country: 'IT' }));
    const user = await getNintendoAccountUser('AT');
    expect(user).toEqual({ id: 'NAID', nickname: 'AndreaC', country: 'IT' });

    const init = (global.fetch as jest.Mock).mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer AT');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('NASDKAPI; Android');
  });

  it('throws on a 401 (token revoked)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notOk(401));
    await expect(getNintendoAccountUser('AT')).rejects.toThrow(/401/);
  });
});

describe('getNintendoUsername', () => {
  it('returns the nickname when set', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({ id: 'NAID', nickname: 'AndreaC' }));
    expect(await getNintendoUsername('AT')).toBe('AndreaC');
  });

  it('returns null when the API throws (fail-silent per M-D13)', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNRESET'));
    expect(await getNintendoUsername('AT')).toBeNull();
  });

  it('returns null when nickname is empty', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({ id: 'NAID', nickname: '' }));
    expect(await getNintendoUsername('AT')).toBeNull();
  });

  it('returns null when access token is empty', async () => {
    expect(await getNintendoUsername('')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

/* ── Moon API: devices + monthly summary ── */

describe('getNintendoDevices', () => {
  it('returns the items array from fetchOwnedDevices', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({
      count: 1,
      items: [{ deviceId: 'd1', label: 'My Switch', device: { id: 'd1', platformGeneration: 'P00' } }],
    }));
    const devices = await getNintendoDevices('AT');
    expect(devices).toHaveLength(1);
    expect(devices[0]?.deviceId).toBe('d1');

    // Moon headers must include the X-Moon-* fingerprint Nintendo gates on.
    const init = (global.fetch as jest.Mock).mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Moon-App-Id']).toBe('com.nintendo.znma');
    expect(headers['X-Moon-Os']).toBe('ANDROID');
    expect(headers.Authorization).toBe('Bearer AT');
  });

  it('returns an empty array when items is missing', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({ count: 0 }));
    expect(await getNintendoDevices('AT')).toEqual([]);
  });

  it('throws on a 401 (access token expired)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notOk(401));
    await expect(getNintendoDevices('AT')).rejects.toThrow(/401/);
  });
});

describe('getNintendoLatestMonthlySummary', () => {
  it('returns the summary on a 200', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({
      month: '2026-05',
      playingTime: 720,
      players: [{ playerId: 'p1', playedGames: [{ meta: { applicationId: 'app-1', title: 'Zelda' }, playingTime: 600, lastPlayDate: '2026-05-28' }] }],
    }));
    const summary = await getNintendoLatestMonthlySummary('AT', 'd1');
    expect(summary?.month).toBe('2026-05');
    expect(summary?.players?.[0]?.playedGames?.[0]?.meta?.title).toBe('Zelda');
  });

  it('returns null on 404 (no summary yet for newly-paired device)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notOk(404));
    expect(await getNintendoLatestMonthlySummary('AT', 'd1')).toBeNull();
  });
});

/* ── syncNintendoLibrary ── */

describe('syncNintendoLibrary', () => {
  const creds = {
    sessionToken: 'ST',
    accessToken: 'AT',
    idToken: 'IT',
    naId: 'NAID',
    expiresAt: new Date(Date.now() + 600 * 1000).toISOString(),
  };

  it('returns an empty list when no devices are paired (silent — drives an empty sync)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(ok({ count: 0, items: [] }));
    const result = await syncNintendoLibrary(creds);
    expect(result).toEqual([]);
  });

  it('aggregates playtime across players on the same device + carries lastPlayDate forward', async () => {
    (global.fetch as jest.Mock)
      // devices
      .mockResolvedValueOnce(ok({ items: [{ deviceId: 'd1' }] }))
      // monthly summary — 2 players both played app-1
      .mockResolvedValueOnce(ok({
        month: '2026-05',
        players: [
          { playerId: 'parent', playedGames: [{ meta: { applicationId: 'app-1', title: 'Mario' }, playingTime: 120, lastPlayDate: '2026-05-20' }] },
          { playerId: 'child',  playedGames: [{ meta: { applicationId: 'app-1', title: 'Mario' }, playingTime: 60,  lastPlayDate: '2026-05-28' }] },
        ],
      }));

    const result = await syncNintendoLibrary(creds);
    expect(result).toHaveLength(1);
    expect(result[0]?.igdbSearchTitle).toBe('Mario');
    expect(result[0]?.playtimeMinutes).toBe(180); // 120 + 60
    expect(result[0]?.lastPlayedAt?.toISOString().startsWith('2026-05-28')).toBe(true);
    expect(result[0]?.platformCode).toBe('NT');
    expect(result[0]?.nintendoTitleId).toBe('app-1');
  });

  it('combines per-device totals when a user owns multiple Switches with the same game', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(ok({ items: [{ deviceId: 'd1' }, { deviceId: 'd2' }] }))
      // device 1
      .mockResolvedValueOnce(ok({
        players: [{ playedGames: [{ meta: { applicationId: 'app-1', title: 'Zelda' }, playingTime: 100, lastPlayDate: '2026-05-10' }] }],
      }))
      // device 2
      .mockResolvedValueOnce(ok({
        players: [{ playedGames: [{ meta: { applicationId: 'app-1', title: 'Zelda' }, playingTime: 50, lastPlayDate: '2026-05-25' }] }],
      }));

    const result = await syncNintendoLibrary(creds);
    expect(result).toHaveLength(1);
    expect(result[0]?.playtimeMinutes).toBe(150);
    expect(result[0]?.lastPlayedAt?.toISOString().startsWith('2026-05-25')).toBe(true);
  });

  it('skips devices whose monthly summary returns null (newly paired, no data yet)', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(ok({ items: [{ deviceId: 'd1' }] }))
      .mockResolvedValueOnce(notOk(404)); // newly paired
    const result = await syncNintendoLibrary(creds);
    expect(result).toEqual([]);
  });

  it('keeps going when one device errors out (per-device failures don\'t fail the whole sync)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(ok({ items: [{ deviceId: 'd1' }, { deviceId: 'd2' }] }))
      .mockResolvedValueOnce(notOk(500)) // d1 fails
      .mockResolvedValueOnce(ok({
        players: [{ playedGames: [{ meta: { applicationId: 'app-2', title: 'Splatoon' }, playingTime: 60 }] }],
      }));
    const result = await syncNintendoLibrary(creds);
    expect(result).toHaveLength(1);
    expect(result[0]?.nintendoTitleId).toBe('app-2');
    errSpy.mockRestore();
  });

  it('throws when id token is missing (defensive guard — Moon API needs idToken, not accessToken)', async () => {
    await expect(syncNintendoLibrary({ ...creds, idToken: '' })).rejects.toThrow(/id token missing/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('falls back to playedApps when per-player playedGames is empty', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(ok({ items: [{ deviceId: 'd1' }] }))
      .mockResolvedValueOnce(ok({
        players: [],
        playedApps: [
          { meta: { applicationId: 'app-3', title: 'Pikmin', shopUri: 'https://nintendo.com/store/products/pikmin/' }, playingTime: 30 },
        ],
      }));
    const result = await syncNintendoLibrary(creds);
    expect(result).toHaveLength(1);
    expect(result[0]?.nintendoTitleId).toBe('app-3');
    expect(result[0]?.playtimeMinutes).toBe(30);
  });
});
