import {
  exchangeEpicAuthCode,
  refreshEpicToken,
  ensureFreshEpicCredentials,
  computeExpiresAt,
  getEpicUsername,
  syncEpicLibrary,
} from './epic';

beforeEach(() => {
  jest.resetAllMocks();
  process.env['EPIC_CLIENT_ID'] = 'test-client-id';
  process.env['EPIC_CLIENT_SECRET'] = 'test-client-secret';
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

/* ── exchangeEpicAuthCode ── */

describe('exchangeEpicAuthCode', () => {
  it('exchanges a code for an access + refresh token + account_id', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({
        access_token: 'AT',
        refresh_token: 'RT',
        account_id: 'ACC',
        expires_in: 7950,
      }),
    );

    const result = await exchangeEpicAuthCode('fresh-code');
    expect(result).toEqual({
      accessToken: 'AT',
      refreshToken: 'RT',
      accountId: 'ACC',
      expiresIn: 7950,
    });

    const callArgs = (global.fetch as jest.Mock).mock.calls[0]!;
    expect(callArgs[0]).toContain('account-public-service-prod03.ol.epicgames.com/account/api/oauth/token');
    const init = callArgs[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    expect(String(init.body)).toContain('grant_type=authorization_code');
    expect(String(init.body)).toContain('code=fresh-code');
  });

  it('throws when Epic returns a 4xx (rejected code)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      notOk(400, { errorCode: 'errors.com.epicgames.account.oauth.authorization_code_not_found' }),
    );
    await expect(exchangeEpicAuthCode('stale-code')).rejects.toThrow(/400/);
  });

  it('throws when Epic returns an incomplete payload', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ access_token: 'AT' }), // no refresh_token, no account_id, no expires_in
    );
    await expect(exchangeEpicAuthCode('code')).rejects.toThrow(/incomplete payload/);
  });

  it('throws when EPIC_CLIENT_ID is not configured', async () => {
    delete process.env['EPIC_CLIENT_ID'];
    await expect(exchangeEpicAuthCode('code')).rejects.toThrow(/EPIC_CLIENT_ID/);
  });
});

/* ── refreshEpicToken ── */

describe('refreshEpicToken', () => {
  it('rotates the refresh token (Epic returns a new one on every refresh)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({
        access_token: 'AT-2',
        refresh_token: 'RT-2',
        account_id: 'ACC',
        expires_in: 7950,
      }),
    );

    const result = await refreshEpicToken('RT-1');
    expect(result.refreshToken).toBe('RT-2'); // NOT the input RT-1
    expect(result.accessToken).toBe('AT-2');

    const init = (global.fetch as jest.Mock).mock.calls[0]![1] as RequestInit;
    expect(String(init.body)).toContain('grant_type=refresh_token');
    expect(String(init.body)).toContain('refresh_token=RT-1');
  });

  it('throws on a 401 (revoked refresh token)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notOk(401));
    await expect(refreshEpicToken('RT')).rejects.toThrow(/401/);
  });
});

/* ── computeExpiresAt + ensureFreshEpicCredentials ── */

describe('computeExpiresAt', () => {
  it('subtracts a 60-second safety margin', () => {
    const before = Date.now();
    const iso = computeExpiresAt(7950);
    const t = new Date(iso).getTime();
    // Should be `now + 7950s - 60s` ± 1s for test execution.
    expect(t).toBeGreaterThanOrEqual(before + (7950 - 60) * 1000 - 1000);
    expect(t).toBeLessThanOrEqual(before + (7950 - 60) * 1000 + 1000);
  });
});

describe('ensureFreshEpicCredentials', () => {
  it('returns the same object identity when the token is still valid', async () => {
    const creds = {
      accessToken: 'AT',
      refreshToken: 'RT',
      accountId: 'ACC',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
    const fresh = await ensureFreshEpicCredentials(creds);
    expect(fresh).toBe(creds); // identity equality — caller skips persist
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refreshes + returns a new object when the token is expired', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({
        access_token: 'AT-2',
        refresh_token: 'RT-2',
        account_id: 'ACC',
        expires_in: 7950,
      }),
    );

    const creds = {
      accessToken: 'AT-1',
      refreshToken: 'RT-1',
      accountId: 'ACC',
      expiresAt: new Date(Date.now() - 1000).toISOString(), // expired 1s ago
    };
    const fresh = await ensureFreshEpicCredentials(creds);
    expect(fresh).not.toBe(creds);
    expect(fresh.accessToken).toBe('AT-2');
    expect(fresh.refreshToken).toBe('RT-2');
  });
});

/* ── getEpicUsername ── */

describe('getEpicUsername', () => {
  it('returns the displayName on a 200 response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ displayName: 'AndreaC' }),
    );
    expect(await getEpicUsername('AT', 'ACC')).toBe('AndreaC');
  });

  it('returns null on a 401', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notOk(401));
    expect(await getEpicUsername('AT', 'ACC')).toBeNull();
  });

  it('returns null on a network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNRESET'));
    expect(await getEpicUsername('AT', 'ACC')).toBeNull();
  });

  it('returns null when accessToken or accountId is empty', async () => {
    expect(await getEpicUsername('', 'ACC')).toBeNull();
    expect(await getEpicUsername('AT', '')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

/* ── syncEpicLibrary ── */

describe('syncEpicLibrary', () => {
  function libPage(records: Array<Partial<{ catalogItemId: string; appName: string; namespace: string; title: string }>>, nextCursor?: string): Response {
    return ok({
      records,
      responseMetadata: nextCursor ? { nextCursor } : {},
    });
  }
  function catalogPage(items: Record<string, { title: string }>): Response {
    return ok(items);
  }

  it('paginates through library + resolves human-readable titles via the catalog bulk endpoint', async () => {
    (global.fetch as jest.Mock)
      // 1. library page 1 (with cursor)
      .mockResolvedValueOnce(libPage([
        { catalogItemId: 'c-1', appName: 'app-1', namespace: 'ns-a', title: 'fallback-1' },
        { catalogItemId: 'c-2', appName: 'app-2', namespace: 'ns-a' },
      ], 'cur-2'))
      // 2. library page 2 (last)
      .mockResolvedValueOnce(libPage([
        { catalogItemId: 'c-3', appName: 'app-3', namespace: 'ns-b' },
      ]))
      // 3. catalog bulk fetch for ns-a (2 ids)
      .mockResolvedValueOnce(catalogPage({
        'c-1': { title: 'Game One' },
        'c-2': { title: 'Game Two' },
      }))
      // 4. catalog bulk fetch for ns-b (1 id)
      .mockResolvedValueOnce(catalogPage({
        'c-3': { title: 'Game Three' },
      }));

    const result = await syncEpicLibrary({
      accessToken: 'AT',
      refreshToken: 'RT',
      accountId: 'ACC',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    expect(result).toHaveLength(3);
    expect(result.map((sg) => sg.igdbSearchTitle).sort()).toEqual(['Game One', 'Game Three', 'Game Two']);
    expect(result.every((sg) => sg.platformCode === 'EP')).toBe(true);
    expect(result.every((sg) => sg.playtimeMinutes === 0)).toBe(true);
    expect(result.every((sg) => sg.lastPlayedAt === null)).toBe(true);
  });

  it('falls back to record.title or appName when the catalog endpoint misses', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(libPage([
        { catalogItemId: 'c-1', appName: 'app-1', namespace: 'ns-a', title: 'record-title-only' },
        { catalogItemId: 'c-2', appName: 'appname-only', namespace: 'ns-a' },
      ]))
      // catalog fetch returns empty — both will fall back
      .mockResolvedValueOnce(catalogPage({}));

    const result = await syncEpicLibrary({
      accessToken: 'AT',
      refreshToken: 'RT',
      accountId: 'ACC',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    expect(result.map((sg) => sg.igdbSearchTitle).sort()).toEqual(['appname-only', 'record-title-only']);
  });

  it('drops records without a catalogItemId (defensive filter)', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(libPage([
        { catalogItemId: 'c-1', title: 'kept', namespace: 'ns-a' },
        { appName: 'no-catalog-id-dropped' } as unknown as { catalogItemId: string },
      ]))
      .mockResolvedValueOnce(catalogPage({}));

    const result = await syncEpicLibrary({
      accessToken: 'AT',
      refreshToken: 'RT',
      accountId: 'ACC',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.epicCatalogItemId).toBe('c-1');
  });

  it('throws on a 401 (token expired — caller should refresh before retry)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notOk(401));
    await expect(
      syncEpicLibrary({
        accessToken: 'AT',
        refreshToken: 'RT',
        accountId: 'ACC',
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      }),
    ).rejects.toThrow(/401/);
  });

  it('throws when accessToken is empty (defensive guard)', async () => {
    await expect(
      syncEpicLibrary({
        accessToken: '',
        refreshToken: 'RT',
        accountId: 'ACC',
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      }),
    ).rejects.toThrow(/access token missing/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
