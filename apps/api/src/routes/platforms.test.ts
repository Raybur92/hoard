import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

jest.mock('@hoard/db', () => ({
  prisma: {
    platform: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    platformLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    game: {
      upsert: jest.fn(),
    },
    userGame: {
      // F1-PR5 rewrite uses findUnique → create-or-update branching.
      // The legacy `upsert` mock stays for any pre-PR5 helper that may
      // still use it; the new methods cover the conflict-matrix path.
      // findMany added for Xbox sub-unit #4.4's playtime side-pass.
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    // F1-PR5 OQ-F1-5: wishlist create wraps userGame + wishlistRelease
    // creation in a transaction. Mock $transaction to execute the
    // callback against a tx that proxies to the same prisma mocks.
    wishlistRelease: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

// F1-PR5 OQ-F1-5: wishlist-create path calls getReleaseDetails to enrich
// the WishlistRelease row. Mock it at module level so tests can override
// per-case.
jest.mock('../services/igdb', () => ({
  getReleaseDetails: jest.fn(),
}));

// Sub-unit #5.1 — the gog/connect route exchanges the OAuth code via
// exchangeGogCode. Mock at module level so tests don't make real
// network calls to auth.gog.com.
jest.mock('../services/platforms/gog', () => {
  const actual = jest.requireActual('../services/platforms/gog');
  return {
    ...actual,
    exchangeGogCode: jest.fn(),
  };
});

jest.mock('../middleware/user', () => ({
  requireUser: (req: Request, _res: Response, next: NextFunction) => { (req as Request & { userId: string }).userId = 'test-user-id'; next(); },
  requireAuth: (req: Request, _res: Response, next: NextFunction) => { (req as Request & { userId: string }).userId = 'test-user-id'; next(); },
}));

jest.mock('../middleware/active', () => ({
  requireActive: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { id: string; status: 'ACTIVE'; isAdmin: boolean } }).user = { id: 'test-user-id', status: 'ACTIVE', isAdmin: false };
    next();
  },
}));

import { app } from '../index';
import { prisma } from '@hoard/db';
import { getReleaseDetails } from '../services/igdb';

const NPSSO_64 = 'A'.repeat(64);

beforeEach(() => {
  jest.resetAllMocks();
  global.fetch = jest.fn() as typeof global.fetch;
});

/* ── GET /api/platforms/status ── */

describe('GET /api/platforms/status', () => {
  it('returns an empty platforms array when the user has no connected platforms', async () => {
    (prisma.platform.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

    const res = await request(app).get('/api/platforms/status');

    expect(res.status).toBe(200);
    expect(res.body.platforms).toEqual([]);
  });

  it('sets a short Cache-Control header (F8)', async () => {
    (prisma.platform.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    const res = await request(app).get('/api/platforms/status');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=30');
  });

  it('returns mapped PlatformDetail entries for connected platforms', async () => {
    (prisma.platform.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'plat-1',
        userId: 'test-user-id',
        code: 'ST',
        syncable: true,
        syncStatus: 'ok',
        lastSyncAt: new Date('2025-01-01'),
        credentials: { username: 'andreah' },
        createdAt: new Date(),
      },
    ]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ code: 'ST', count: 42 }]);

    const res = await request(app).get('/api/platforms/status');

    expect(res.status).toBe(200);
    expect(res.body.platforms).toHaveLength(1);
    expect(res.body.platforms[0].code).toBe('ST');
    expect(res.body.platforms[0].who).toBe('andreah');
    expect(res.body.platforms[0].connected).toBe(true);
    expect(res.body.platforms[0].syncStatus).toBe('ok');
  });
});

/* ── POST /api/platforms/psn/connect ── */

describe('POST /api/platforms/psn/connect', () => {
  it('returns 400 when the NPSSO token is shorter than 64 characters', async () => {
    const res = await request(app)
      .post('/api/platforms/psn/connect')
      .send({ npsso: 'tooshort' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/64 characters/);
  });

  it('returns 400 when the NPSSO token is longer than 64 characters', async () => {
    const res = await request(app)
      .post('/api/platforms/psn/connect')
      .send({ npsso: 'A'.repeat(65) });

    expect(res.status).toBe(400);
  });

  it('upserts the platform record and returns ok for a valid 64-character token', async () => {
    (prisma.platform.upsert as jest.Mock).mockResolvedValue({ id: 'plat-ps-1' });

    const res = await request(app)
      .post('/api/platforms/psn/connect')
      .send({ npsso: NPSSO_64 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // getPsnUsername short-circuits to null in this test env (psn-api
    // calls fail through to the fail-silent catch), so credentials stay
    // npsso-only — no username field added.
    expect(prisma.platform.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ code: 'PS', credentials: { npsso: NPSSO_64 } }),
      }),
    );
  });
});

/* ── POST /api/platforms/xbox/connect ── */

describe('POST /api/platforms/xbox/connect', () => {
  it('returns 400 for an API key shorter than 10 characters', async () => {
    const res = await request(app)
      .post('/api/platforms/xbox/connect')
      .send({ apiKey: 'short' });

    expect(res.status).toBe(400);
  });

  it('upserts the platform record and returns ok for a valid API key', async () => {
    (prisma.platform.upsert as jest.Mock).mockResolvedValue({ id: 'plat-xb-1' });

    const res = await request(app)
      .post('/api/platforms/xbox/connect')
      .send({ apiKey: 'valid-openxbl-key-here' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prisma.platform.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ code: 'XB' }),
      }),
    );
  });
});

/* ── GET /api/platforms/gog/auth-url ── */

describe('GET /api/platforms/gog/auth-url', () => {
  const ORIGINAL_CLIENT_ID = process.env['GOG_CLIENT_ID'];
  afterEach(() => {
    if (ORIGINAL_CLIENT_ID === undefined) delete process.env['GOG_CLIENT_ID'];
    else process.env['GOG_CLIENT_ID'] = ORIGINAL_CLIENT_ID;
  });

  it('returns the Galaxy auth URL when GOG_CLIENT_ID is configured', async () => {
    process.env['GOG_CLIENT_ID'] = 'test-galaxy-id';
    const res = await request(app).get('/api/platforms/gog/auth-url');
    expect(res.status).toBe(200);
    expect(typeof res.body.url).toBe('string');
    // URL should start with the Galaxy auth host and carry the configured
    // client_id + Galaxy's hardcoded redirect URI.
    expect(res.body.url).toMatch(/^https:\/\/auth\.gog\.com\/auth\?/);
    expect(res.body.url).toContain('client_id=test-galaxy-id');
    expect(res.body.url).toContain('redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient');
  });

  it('returns 500 when GOG_CLIENT_ID is missing (deployment misconfig)', async () => {
    delete process.env['GOG_CLIENT_ID'];
    const res = await request(app).get('/api/platforms/gog/auth-url');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/not configured/i);
  });
});

/* ── POST /api/platforms/itch/connect (M1) ── */

jest.mock('../services/platforms/itch', () => {
  const actual = jest.requireActual('../services/platforms/itch');
  return {
    ...actual,
    validateItchApiKey: jest.fn(),
    getItchUsername: jest.fn(),
    // syncItchLibrary stays the real implementation; the sync route
    // tests below mock fetch directly to control the response.
  };
});

import { validateItchApiKey as mockedValidateItch, getItchUsername as mockedGetItchUsername } from '../services/platforms/itch';

describe('POST /api/platforms/itch/connect', () => {
  it('returns 400 when the API key is missing or too short', async () => {
    const res = await request(app).post('/api/platforms/itch/connect').send({});
    expect(res.status).toBe(400);

    const res2 = await request(app).post('/api/platforms/itch/connect').send({ apiKey: 'short' });
    expect(res2.status).toBe(400);

    expect(mockedValidateItch).not.toHaveBeenCalled();
    expect(prisma.platform.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when itch.io rejects the key (no DB write)', async () => {
    (mockedValidateItch as jest.Mock).mockResolvedValue(false);

    const res = await request(app)
      .post('/api/platforms/itch/connect')
      .send({ apiKey: 'a-real-looking-key-but-rejected' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/itch\.io rejected/i);
    expect(prisma.platform.upsert).not.toHaveBeenCalled();
  });

  it('validates → captures username → persists, returns 200 on success', async () => {
    (mockedValidateItch as jest.Mock).mockResolvedValue(true);
    (mockedGetItchUsername as jest.Mock).mockResolvedValue('Andrea');
    (prisma.platform.upsert as jest.Mock).mockResolvedValue({ id: 'plat-it-1' });

    const res = await request(app)
      .post('/api/platforms/itch/connect')
      .send({ apiKey: 'a-real-looking-key-ok' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.platformId).toBe('plat-it-1');
    expect(prisma.platform.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_code: { userId: 'test-user-id', code: 'IT' } },
        create: expect.objectContaining({
          code: 'IT',
          syncable: true,
          syncStatus: 'ok',
          credentials: expect.objectContaining({
            apiKey: 'a-real-looking-key-ok',
            username: 'Andrea',
          }),
        }),
      }),
    );
  });

  it('persists without a username field when getItchUsername returns null (fail-silent)', async () => {
    (mockedValidateItch as jest.Mock).mockResolvedValue(true);
    (mockedGetItchUsername as jest.Mock).mockResolvedValue(null);
    (prisma.platform.upsert as jest.Mock).mockResolvedValue({ id: 'plat-it-2' });

    const res = await request(app)
      .post('/api/platforms/itch/connect')
      .send({ apiKey: 'a-real-looking-key-ok' });

    expect(res.status).toBe(200);
    const call = (prisma.platform.upsert as jest.Mock).mock.calls[0][0];
    expect(call.create.credentials).toEqual({ apiKey: 'a-real-looking-key-ok' });
    expect(call.create.credentials.username).toBeUndefined();
  });
});

/* ── POST /api/platforms/epic/connect + GET auth-url (M2) ── */

jest.mock('../services/platforms/epic', () => {
  const actual = jest.requireActual('../services/platforms/epic');
  return {
    ...actual,
    exchangeEpicAuthCode: jest.fn(),
    getEpicUsername: jest.fn(),
  };
});

import { exchangeEpicAuthCode as mockedExchangeEpicCode, getEpicUsername as mockedGetEpicUsername, EPIC_LOGIN_URL } from '../services/platforms/epic';

describe('GET /api/platforms/epic/auth-url', () => {
  it('returns the Epic login URL (no env required — the URL is module-constant)', async () => {
    const res = await request(app).get('/api/platforms/epic/auth-url');
    expect(res.status).toBe(200);
    expect(res.body.url).toBe(EPIC_LOGIN_URL);
    expect(typeof res.body.url).toBe('string');
    expect(res.body.url).toContain('epicgames.com/id/login');
  });
});

describe('POST /api/platforms/epic/connect', () => {
  it('returns 400 when the code is missing or empty', async () => {
    const res = await request(app).post('/api/platforms/epic/connect').send({});
    expect(res.status).toBe(400);

    const res2 = await request(app).post('/api/platforms/epic/connect').send({ code: '' });
    expect(res2.status).toBe(400);

    expect(mockedExchangeEpicCode).not.toHaveBeenCalled();
    expect(prisma.platform.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when Epic rejects the code (no DB write)', async () => {
    (mockedExchangeEpicCode as jest.Mock).mockRejectedValue(
      new Error('Epic token exchange failed: 400 authorization_code_not_found'),
    );

    const res = await request(app)
      .post('/api/platforms/epic/connect')
      .send({ code: 'stale-code' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/single-use|expire|start.*over/i);
    expect(prisma.platform.upsert).not.toHaveBeenCalled();
  });

  it('exchanges, persists all 4 cred fields + username, returns 200 on success', async () => {
    (mockedExchangeEpicCode as jest.Mock).mockResolvedValue({
      accessToken: 'AT',
      refreshToken: 'RT',
      accountId: 'ACC-32-HEX',
      expiresIn: 7950,
    });
    (mockedGetEpicUsername as jest.Mock).mockResolvedValue('AndreaC');
    (prisma.platform.upsert as jest.Mock).mockResolvedValue({ id: 'plat-ep-1' });

    const res = await request(app)
      .post('/api/platforms/epic/connect')
      .send({ code: 'fresh-code' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.platformId).toBe('plat-ep-1');

    expect(mockedExchangeEpicCode).toHaveBeenCalledWith('fresh-code');
    expect(prisma.platform.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_code: { userId: 'test-user-id', code: 'EP' } },
        create: expect.objectContaining({
          code: 'EP',
          syncable: true,
          syncStatus: 'ok',
          credentials: expect.objectContaining({
            accessToken: 'AT',
            refreshToken: 'RT',
            accountId: 'ACC-32-HEX',
            expiresAt: expect.any(String),
            username: 'AndreaC',
          }),
        }),
      }),
    );

    // expiresAt should reflect the 60-second safety margin.
    const credentials = (prisma.platform.upsert as jest.Mock).mock.calls[0][0].create.credentials;
    const expiresAt = new Date(credentials.expiresAt as string).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now() + (7950 - 65) * 1000);
    expect(expiresAt).toBeLessThan(Date.now() + 7950 * 1000);
  });

  it('persists without a username field when getEpicUsername returns null', async () => {
    (mockedExchangeEpicCode as jest.Mock).mockResolvedValue({
      accessToken: 'AT',
      refreshToken: 'RT',
      accountId: 'ACC',
      expiresIn: 7950,
    });
    (mockedGetEpicUsername as jest.Mock).mockResolvedValue(null);
    (prisma.platform.upsert as jest.Mock).mockResolvedValue({ id: 'plat-ep-2' });

    await request(app)
      .post('/api/platforms/epic/connect')
      .send({ code: 'fresh-code' });

    const call = (prisma.platform.upsert as jest.Mock).mock.calls[0][0];
    expect(call.create.credentials.username).toBeUndefined();
    expect(call.create.credentials.accessToken).toBe('AT');
  });
});

/* ── POST /api/platforms/gog/connect ── */

import { exchangeGogCode as mockedExchangeGogCode } from '../services/platforms/gog';

describe('POST /api/platforms/gog/connect', () => {
  it('returns 400 when the OAuth code is missing or empty', async () => {
    const res = await request(app).post('/api/platforms/gog/connect').send({});
    expect(res.status).toBe(400);

    const res2 = await request(app).post('/api/platforms/gog/connect').send({ code: '' });
    expect(res2.status).toBe(400);

    expect(mockedExchangeGogCode).not.toHaveBeenCalled();
    expect(prisma.platform.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when GOG rejects the code (single-use, fast expiry — common error)', async () => {
    (mockedExchangeGogCode as jest.Mock).mockRejectedValue(
      new Error('GOG token exchange failed: 400 invalid_grant'),
    );

    const res = await request(app)
      .post('/api/platforms/gog/connect')
      .send({ code: 'stale-or-reused-code' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/single-use|expire|start.*over/i);
    // No DB write when token exchange failed.
    expect(prisma.platform.upsert).not.toHaveBeenCalled();
  });

  it('exchanges the code, persists tokens + expiresAt, and returns 200 on success', async () => {
    (mockedExchangeGogCode as jest.Mock).mockResolvedValue({
      accessToken: 'AT',
      refreshToken: 'RT',
      expiresIn: 3600,
    });
    (prisma.platform.upsert as jest.Mock).mockResolvedValue({ id: 'plat-gg-1' });

    const res = await request(app)
      .post('/api/platforms/gog/connect')
      .send({ code: 'fresh-oauth-code' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.platformId).toBe('plat-gg-1');

    expect(mockedExchangeGogCode).toHaveBeenCalledWith('fresh-oauth-code');
    expect(prisma.platform.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_code: { userId: 'test-user-id', code: 'GG' } },
        create: expect.objectContaining({
          code: 'GG',
          syncable: true,
          syncStatus: 'ok',
          credentials: expect.objectContaining({
            accessToken: 'AT',
            refreshToken: 'RT',
            expiresAt: expect.any(String),
          }),
        }),
      }),
    );

    // expiresAt is an ISO string ~60s before now+3600s (safety margin).
    const credentials = (prisma.platform.upsert as jest.Mock).mock.calls[0][0].create.credentials;
    const expiresAt = new Date(credentials.expiresAt as string).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now() + 3500 * 1000);
    expect(expiresAt).toBeLessThan(Date.now() + 3600 * 1000);
  });

  it('upsert update path overwrites credentials + flips syncStatus to ok (reconnect after refresh-token expiry)', async () => {
    (mockedExchangeGogCode as jest.Mock).mockResolvedValue({
      accessToken: 'AT-2',
      refreshToken: 'RT-2',
      expiresIn: 3600,
    });
    (prisma.platform.upsert as jest.Mock).mockResolvedValue({ id: 'plat-gg-1' });

    await request(app)
      .post('/api/platforms/gog/connect')
      .send({ code: 'reconnect-code' });

    expect(prisma.platform.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          credentials: expect.objectContaining({ accessToken: 'AT-2', refreshToken: 'RT-2' }),
          syncStatus: 'ok',
        }),
      }),
    );
  });
});

/* ── DELETE /api/platforms/:code ── */

describe('DELETE /api/platforms/:code', () => {
  it('returns 404 when no matching platform record exists', async () => {
    (prisma.platform.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

    const res = await request(app).delete('/api/platforms/st');

    expect(res.status).toBe(404);
  });

  it('deletes the platform record and returns ok', async () => {
    (prisma.platform.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    const res = await request(app).delete('/api/platforms/st');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prisma.platform.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ code: 'ST' }) }),
    );
  });
});

/* ── GET /api/platforms/:code/log ── */

describe('GET /api/platforms/:code/log', () => {
  const sampleEntries = [
    { id: 'log-3', platformId: 'plat-1', userId: 'test-user-id', level: 'info', event: 'sync.ok', message: 'sync ok in 10.2s', details: { durationMs: 10234 }, createdAt: new Date('2026-05-08T17:55:19Z') },
    { id: 'log-2', platformId: 'plat-1', userId: 'test-user-id', level: 'info', event: 'library.imported', message: 'library: 488 imported, 4 skipped', details: { imported: 488, skipped: 4 }, createdAt: new Date('2026-05-08T17:55:14Z') },
    { id: 'log-1', platformId: 'plat-1', userId: 'test-user-id', level: 'info', event: 'sync.started', message: '// ST sync started', details: null, createdAt: new Date('2026-05-08T17:55:09Z') },
  ];

  it('returns 400 for an invalid platform code', async () => {
    const res = await request(app).get('/api/platforms/zz/log');
    expect(res.status).toBe(400);
  });

  it('returns 404 when the user has not connected this platform', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await request(app).get('/api/platforms/st/log');
    expect(res.status).toBe(404);
  });

  it('returns mapped entries with createdAt as ISO and nextCursor=null when fewer than PAGE entries returned', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({ id: 'plat-1', userId: 'test-user-id', code: 'ST' });
    (prisma.platformLog.findMany as jest.Mock).mockResolvedValue(sampleEntries);

    const res = await request(app).get('/api/platforms/st/log');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(3);
    expect(res.body.entries[0].id).toBe('log-3');
    expect(res.body.entries[0].createdAt).toBe('2026-05-08T17:55:19.000Z');
    expect(res.body.entries[0].details).toEqual({ durationMs: 10234 });
    // Fewer than PAGE entries means we drained.
    expect(res.body.nextCursor).toBeNull();
  });

  it('forwards the cursor query param to Prisma and returns nextCursor on full pages', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({ id: 'plat-1', userId: 'test-user-id', code: 'ST' });
    // Simulate a full 50-entry page.
    const fullPage = Array.from({ length: 50 }, (_, i) => ({
      ...sampleEntries[0]!,
      id: `log-${50 - i}`,
      createdAt: new Date(Date.now() - i * 1000),
    }));
    (prisma.platformLog.findMany as jest.Mock).mockResolvedValue(fullPage);

    const res = await request(app).get('/api/platforms/st/log?cursor=log-99');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(50);
    expect(res.body.nextCursor).toBe('log-1'); // last id in the page

    const findManyCall = (prisma.platformLog.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.cursor).toEqual({ id: 'log-99' });
    expect(findManyCall.skip).toBe(1);
    expect(findManyCall.take).toBe(50);
    expect(findManyCall.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(findManyCall.where).toEqual({ platformId: 'plat-1' });
  });
});

/* ── GET /api/platforms/:code/credentials ── */

describe('GET /api/platforms/:code/credentials', () => {
  it('returns 404 for an unsupported platform code', async () => {
    const res = await request(app).get('/api/platforms/zz/credentials');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a supported code that the user has not connected', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await request(app).get('/api/platforms/ps/credentials');
    expect(res.status).toBe(404);
  });

  it('returns the npsso for PSN when the user has it stored', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({
      id: 'plat-1', userId: 'test-user-id', code: 'PS',
      credentials: { npsso: 'A'.repeat(64) },
    });
    const res = await request(app).get('/api/platforms/ps/credentials');
    expect(res.status).toBe(200);
    expect(res.body.npsso).toBe('A'.repeat(64));
    // Cache-Control: no-store so the credential never sits in browser cache.
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns the steamId for Steam', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({
      id: 'plat-2', userId: 'test-user-id', code: 'ST',
      credentials: { steamId: '76561197960287930', username: 'gabe' },
    });
    const res = await request(app).get('/api/platforms/st/credentials');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ steamId: '76561197960287930' });
    // Username should NOT leak through; only the credential field comes back.
    expect(res.body.username).toBeUndefined();
  });

  it('returns 404 when credentials column is null on the platform row', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({
      id: 'plat-3', userId: 'test-user-id', code: 'PS',
      credentials: null,
    });
    const res = await request(app).get('/api/platforms/ps/credentials');
    expect(res.status).toBe(404);
  });
});

/* ── PATCH /api/platforms/:code ── */

describe('PATCH /api/platforms/:code', () => {
  it('returns 400 for an invalid platform code', async () => {
    const res = await request(app).patch('/api/platforms/zz').send({ syncFrequency: 'HOURLY' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid syncFrequency value', async () => {
    const res = await request(app).patch('/api/platforms/st').send({ syncFrequency: 'EVERY_NIGHT' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the platform is not connected', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await request(app).patch('/api/platforms/st').send({ syncFrequency: 'HOURLY' });
    expect(res.status).toBe(404);
  });

  it('updates syncFrequency and returns the mapped PlatformDetail', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({
      id: 'plat-1', userId: 'test-user-id', code: 'ST',
      syncable: true, syncStatus: 'ok', syncFrequency: 'HOURLY',
      lastSyncAt: new Date('2026-05-07T10:00:00Z'),
      credentials: { username: 'andrea' },
    });
    (prisma.platform.update as jest.Mock).mockResolvedValue({
      id: 'plat-1', userId: 'test-user-id', code: 'ST',
      syncable: true, syncStatus: 'ok', syncFrequency: 'FIVE_MIN',
      lastSyncAt: new Date('2026-05-07T10:00:00Z'),
      credentials: { username: 'andrea' },
    });

    const res = await request(app).patch('/api/platforms/st').send({ syncFrequency: 'FIVE_MIN' });

    expect(res.status).toBe(200);
    expect(res.body.syncFrequency).toBe('FIVE_MIN');
    expect(res.body.code).toBe('ST');
    expect(prisma.platform.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { syncFrequency: 'FIVE_MIN' } }),
    );
  });

  it('treats an empty body as a no-op and returns the current row', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({
      id: 'plat-1', userId: 'test-user-id', code: 'ST',
      syncable: true, syncStatus: 'ok', syncFrequency: 'HOURLY',
      lastSyncAt: null, credentials: null,
    });

    const res = await request(app).patch('/api/platforms/st').send({});

    expect(res.status).toBe(200);
    expect(res.body.syncFrequency).toBe('HOURLY');
    expect(prisma.platform.update).not.toHaveBeenCalled();
  });
});

/* ── POST /api/platforms/:code/sync ── */

describe('POST /api/platforms/:code/sync', () => {
  it('returns 400 for an unrecognised platform code', async () => {
    const res = await request(app).post('/api/platforms/zz/sync');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid|unsupported/i);
  });

  it('returns 404 when the platform is not yet connected', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app).post('/api/platforms/st/sync');

    expect(res.status).toBe(404);
  });

  it('responds immediately with syncing status and updates the platform record', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({
      id: 'plat-1',
      code: 'ST',
      syncable: true,
      credentials: { steamId: '76561198000000001' },
    });
    (prisma.platform.update as jest.Mock).mockResolvedValue({});
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ response: { games: [] } }),
    });

    const res = await request(app).post('/api/platforms/st/sync');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('syncing');
    expect(prisma.platform.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { syncStatus: 'syncing' } }),
    );
  });

  // Xbox sync sub-unit #2 — verify the XB branch is reachable + routes
  // through syncXboxLibrary. The actual fetcher + sync orchestration are
  // unit-tested in xbox.test.ts and syncRunner.test.ts; this is just the
  // route-level wiring assertion.
  it('accepts XB sync against a connected platform with apiKey credentials', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({
      id: 'plat-xb-1',
      code: 'XB',
      syncable: true,
      credentials: { apiKey: 'fake-openxbl-key' },
      lastSyncAt: null,
    });
    (prisma.platform.update as jest.Mock).mockResolvedValue({});
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ titles: [] }),
    });

    const res = await request(app).post('/api/platforms/xb/sync');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('syncing');
    // The route does not 400/404 the XB code — confirms it's recognised
    // as a syncable platform with real implementation behind it.
  });

  // GOG sync sub-unit #5.3 — verify the GG branch is reachable + routes
  // through ensureFreshGogCredentials + syncGogLibrary. Token has a
  // future expiresAt so the refresh path is short-circuited (the real
  // `ensureFreshGogCredentials` is used via jest.requireActual at the
  // top of this file). syncGogLibrary then runs and fetches the empty
  // products list via the mocked global.fetch.
  it('accepts GG sync against a connected platform with valid OAuth tokens', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({
      id: 'plat-gg-1',
      code: 'GG',
      syncable: true,
      credentials: {
        accessToken: 'fake-gog-access',
        refreshToken: 'fake-gog-refresh',
        expiresAt: future,
      },
      lastSyncAt: null,
    });
    (prisma.platform.update as jest.Mock).mockResolvedValue({});
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ products: [], totalPages: 1 }),
    });

    const res = await request(app).post('/api/platforms/gg/sync');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('syncing');
  });
});

/* ── POST /api/games/manual ── */

describe('POST /api/games/manual', () => {
  /**
   * Helper — build the "full Prisma row" shape that mapUserGame() expects.
   * The route now returns mapUserGame(userGame) instead of a flat payload,
   * so every successful test needs prisma.userGame.create / update to
   * return a row include-shaped object (UserGame + nested .game + hltbData).
   */
  function makeUgRow(overrides: {
    id?: string;
    status?: string;
    playtimeByPlatform?: Record<string, number>;
    gameId?: string;
    igdbId?: number;
    title?: string;
  } = {}) {
    return {
      id: overrides.id ?? 'ug-new',
      userId: 'test-user-id',
      gameId: overrides.gameId ?? 'game-x',
      status: overrides.status ?? 'Backlog',
      playtimeByPlatform: overrides.playtimeByPlatform ?? {},
      lastPlayedAt: null,
      notes: null,
      rating: null,
      achievementsByPlatform: {},
      mediaType: null,
      condition: null,
      region: null,
      wishlistedPlatforms: [] as string[],
      addedAt: new Date('2026-05-24T00:00:00Z'),
      updatedAt: new Date('2026-05-24T00:00:00Z'),
      game: {
        id: overrides.gameId ?? 'game-x',
        igdbId: overrides.igdbId ?? 1234,
        title: overrides.title ?? 'Test Game',
        developer: null,
        releaseYear: null,
        genres: [],
        coverUrl: null,
        steamAppId: null,
        hltbId: null,
        gogAppId: null,
        psnNpCommunicationId: null,
        hltbData: null,
      },
    };
  }

  // ── Pure Zod validation tests — unaffected by F1-PR5 ──

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/games/manual')
      .send({ platformLabel: 'Nintendo' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an unrecognised status value', async () => {
    const res = await request(app)
      .post('/api/games/manual')
      .send({ igdbId: 1234, title: 'Metroid Prime', platformLabel: 'Nintendo', status: 'NotAStatus' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid mediaType values (Zod schema enforces the 2-value enum)', async () => {
    const res = await request(app)
      .post('/api/games/manual')
      .send({
        igdbId: 44444, title: 'Bad Media', platformLabel: 'PC', status: 'Backlog',
        mediaType: 'PHYSICAL_DISC',
      });
    expect(res.status).toBe(400);
  });

  it('rejects negative manualPlaytimeMinutes', async () => {
    const res = await request(app)
      .post('/api/games/manual')
      .send({
        igdbId: 88888, title: 'Bad Playtime', platformLabel: 'PC', status: 'Backlog',
        manualPlaytimeMinutes: -1,
      });
    expect(res.status).toBe(400);
  });

  it('rejects non-integer manualPlaytimeMinutes (Zod .int())', async () => {
    const res = await request(app)
      .post('/api/games/manual')
      .send({
        igdbId: 99999, title: 'Bad Playtime', platformLabel: 'PC', status: 'Backlog',
        manualPlaytimeMinutes: 30.5,
      });
    expect(res.status).toBe(400);
  });

  it('rejects manualPlaytimeMinutes above the 600000-min ceiling', async () => {
    const res = await request(app)
      .post('/api/games/manual')
      .send({
        igdbId: 100000, title: 'Bad Playtime', platformLabel: 'PC', status: 'Backlog',
        manualPlaytimeMinutes: 600001,
      });
    expect(res.status).toBe(400);
  });

  // ── CREATE PATH (no existing UserGame — matrix rows 1+2) ──

  describe('CREATE path (no existing UserGame)', () => {
    beforeEach(() => {
      // Default: no existing UserGame.
      (prisma.userGame.findUnique as jest.Mock).mockResolvedValue(null);
    });

    it('owned + P: creates UserGame with playtimeByPlatform={P: 0} and returns 201 (Row 1)', async () => {
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-1', igdbId: 99999, title: 'Metroid Prime' });
      (prisma.userGame.create as jest.Mock).mockResolvedValue(makeUgRow({
        id: 'ug-1', gameId: 'game-1', igdbId: 99999, title: 'Metroid Prime',
        status: 'Backlog', playtimeByPlatform: { Nintendo: 0 },
      }));

      const res = await request(app)
        .post('/api/games/manual')
        .send({ igdbId: 99999, title: 'Metroid Prime', platformLabel: 'Nintendo', status: 'Backlog' });

      expect(res.status).toBe(201);
      // Response is the full mapUserGame() shape — userGameId at res.body.id,
      // game data nested under res.body.game.
      expect(res.body.id).toBe('ug-1');
      expect(res.body.game.igdbId).toBe(99999);
      expect(res.body.game.title).toBe('Metroid Prime');
      expect(res.body.status).toBe('Backlog');
      expect(prisma.userGame.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'Backlog',
            playtimeByPlatform: { Nintendo: 0 },
          }),
        }),
      );
      expect(prisma.userGame.update).not.toHaveBeenCalled();
    });

    it('wishlist: creates UserGame with status=Wishlist + EMPTY playtimeByPlatform per CM13 (Row 2)', async () => {
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-w', igdbId: 77777, title: 'Future Game' });
      (prisma.userGame.create as jest.Mock).mockResolvedValue(makeUgRow({
        id: 'ug-w', gameId: 'game-w', igdbId: 77777, title: 'Future Game',
        status: 'Wishlist', playtimeByPlatform: {},
      }));

      await request(app)
        .post('/api/games/manual')
        .send({ igdbId: 77777, title: 'Future Game', platformLabel: 'PC', status: 'Wishlist' });

      expect(prisma.userGame.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'Wishlist',
            // CM13: wishlist creates carry NO platform binding.
            playtimeByPlatform: {},
          }),
        }),
      );
    });

    it('wishlist: ignores manualPlaytimeMinutes (wishlist has no platform binding)', async () => {
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-w2', igdbId: 77778, title: 'Future Game' });
      (prisma.userGame.create as jest.Mock).mockResolvedValue(makeUgRow({
        id: 'ug-w2', status: 'Wishlist', playtimeByPlatform: {},
      }));

      await request(app)
        .post('/api/games/manual')
        .send({ igdbId: 77778, title: 'Future Game', platformLabel: 'PC', status: 'Wishlist', manualPlaytimeMinutes: 1830 });

      // The 1830 from manualPlaytimeMinutes does NOT flow into playtimeByPlatform
      // — wishlist creates always get {}.
      const createCall = (prisma.userGame.create as jest.Mock).mock.calls[0]?.[0];
      expect(createCall.data.playtimeByPlatform).toEqual({});
    });

    it('maps "On Hold" status to "OnHold" Prisma enum on create', async () => {
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-2', igdbId: 11111, title: 'Zelda' });
      (prisma.userGame.create as jest.Mock).mockResolvedValue(makeUgRow({ id: 'ug-2', status: 'OnHold' }));

      await request(app)
        .post('/api/games/manual')
        .send({ igdbId: 11111, title: 'Zelda', platformLabel: 'Nintendo', status: 'On Hold' });

      expect(prisma.userGame.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'OnHold' }) }),
      );
    });

    // F1-PR2 collector-metadata fields per CM2 + CM12
    it('passes mediaType + condition + region through on create when provided', async () => {
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-3', igdbId: 22222, title: 'Pokémon Red' });
      (prisma.userGame.create as jest.Mock).mockResolvedValue(makeUgRow({ id: 'ug-3' }));

      await request(app)
        .post('/api/games/manual')
        .send({
          igdbId: 22222, title: 'Pokémon Red', platformLabel: 'Game Boy', status: 'Backlog',
          mediaType: 'PHYSICAL', condition: 'LOOSE', region: 'PAL',
        });

      expect(prisma.userGame.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mediaType: 'PHYSICAL', condition: 'LOOSE', region: 'PAL',
          }),
        }),
      );
    });

    it('omits optional fields from create payload when not provided', async () => {
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-4', igdbId: 33333, title: 'Some Game' });
      (prisma.userGame.create as jest.Mock).mockResolvedValue(makeUgRow({ id: 'ug-4' }));

      await request(app)
        .post('/api/games/manual')
        .send({ igdbId: 33333, title: 'Some Game', platformLabel: 'PC', status: 'Backlog' });

      const createCall = (prisma.userGame.create as jest.Mock).mock.calls[0]?.[0];
      expect(createCall.data).not.toHaveProperty('mediaType');
      expect(createCall.data).not.toHaveProperty('condition');
      expect(createCall.data).not.toHaveProperty('region');
      expect(createCall.data).not.toHaveProperty('wishlistedPlatforms');
    });

    // F1-PR3 manual playtime
    it('seeds playtimeByPlatform from manualPlaytimeMinutes when provided (owned create)', async () => {
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-5', igdbId: 55555, title: 'Pokémon Yellow' });
      (prisma.userGame.create as jest.Mock).mockResolvedValue(makeUgRow({ id: 'ug-5' }));

      await request(app)
        .post('/api/games/manual')
        .send({
          igdbId: 55555, title: 'Pokémon Yellow', platformLabel: 'Game Boy',
          status: 'Completed', manualPlaytimeMinutes: 1830,
        });

      expect(prisma.userGame.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ playtimeByPlatform: { 'Game Boy': 1830 } }),
        }),
      );
    });

    it('falls back to playtimeByPlatform={P: 0} when manualPlaytimeMinutes omitted', async () => {
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-6', igdbId: 66666, title: 'Some Game' });
      (prisma.userGame.create as jest.Mock).mockResolvedValue(makeUgRow({ id: 'ug-6' }));

      await request(app)
        .post('/api/games/manual')
        .send({ igdbId: 66666, title: 'Some Game', platformLabel: 'Nintendo', status: 'Backlog' });

      expect(prisma.userGame.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ playtimeByPlatform: { Nintendo: 0 } }),
        }),
      );
    });

    // ── F1-PR5 OQ-F1-5: atomic WishlistRelease creation ──

    it('OQ-F1-5: wishlist create with IGDB release data → userGame + WishlistRelease inside $transaction', async () => {
      const ugRow = makeUgRow({
        id: 'ug-wl-1', gameId: 'game-wl-1', igdbId: 88888,
        title: 'Future Hype', status: 'Wishlist', playtimeByPlatform: {},
      });
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-wl-1', igdbId: 88888, title: 'Future Hype' });
      (getReleaseDetails as jest.Mock).mockResolvedValue({
        igdbId: 88888,
        title: 'Future Hype',
        developer: 'Mega Crit',
        releaseDate: '2027-03-15T00:00:00.000Z',
        releaseDateCategory: 'date',
        platforms: ['PC', 'PS5'],
        genres: ['Card Game'],
        coverUrl: 'https://images.igdb.com/cover.jpg',
        synopsis: 'A future game.',
        hype: 95,
        category: 0,
      });

      // $transaction is invoked with a callback; mock it to run the callback
      // against a tx proxy that reuses our existing prisma mocks.
      const txCreate = jest.fn().mockResolvedValue(ugRow);
      const txWlCreate = jest.fn().mockResolvedValue({ id: 'wl-1', igdbId: 88888 });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
        return await cb({
          userGame: { create: txCreate },
          wishlistRelease: { create: txWlCreate },
        });
      });

      const res = await request(app)
        .post('/api/games/manual')
        .send({ igdbId: 88888, title: 'Future Hype', platformLabel: 'PC', status: 'Wishlist' });

      expect(res.status).toBe(201);
      expect(getReleaseDetails).toHaveBeenCalledWith(88888);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // Both writes happened inside the transaction.
      expect(txCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'Wishlist', playtimeByPlatform: {} }),
        }),
      );
      expect(txWlCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'test-user-id',
            igdbId: 88888,
            title: 'Future Hype',
            developer: 'Mega Crit',
            releaseDateCategory: 'date',
            platforms: ['PC', 'PS5'],
            hype: 95,
          }),
        }),
      );
      // No fallback path triggered.
      expect(prisma.userGame.create).not.toHaveBeenCalled();
    });

    it('OQ-F1-5 graceful degradation: wishlist create with IGDB returning null → only userGame.create, no WishlistRelease', async () => {
      const ugRow = makeUgRow({ id: 'ug-wl-2', status: 'Wishlist', playtimeByPlatform: {} });
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-wl-2', igdbId: 88889, title: 'Retro Game' });
      (getReleaseDetails as jest.Mock).mockResolvedValue(null);
      (prisma.userGame.create as jest.Mock).mockResolvedValue(ugRow);

      const res = await request(app)
        .post('/api/games/manual')
        .send({ igdbId: 88889, title: 'Retro Game', platformLabel: 'PC', status: 'Wishlist' });

      expect(res.status).toBe(201);
      expect(getReleaseDetails).toHaveBeenCalledWith(88889);
      // No transaction opened — fallback path used plain create.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.userGame.create).toHaveBeenCalledTimes(1);
      expect(prisma.wishlistRelease.create).not.toHaveBeenCalled();
    });

    it('OQ-F1-5 graceful degradation: wishlist create with IGDB throwing → still creates UserGame', async () => {
      const ugRow = makeUgRow({ id: 'ug-wl-3', status: 'Wishlist', playtimeByPlatform: {} });
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-wl-3', igdbId: 88890, title: 'Unreachable' });
      (getReleaseDetails as jest.Mock).mockRejectedValue(new Error('IGDB 500'));
      (prisma.userGame.create as jest.Mock).mockResolvedValue(ugRow);

      const res = await request(app)
        .post('/api/games/manual')
        .send({ igdbId: 88890, title: 'Unreachable', platformLabel: 'PC', status: 'Wishlist' });

      expect(res.status).toBe(201);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.userGame.create).toHaveBeenCalledTimes(1);
      expect(prisma.wishlistRelease.create).not.toHaveBeenCalled();
    });

    it('OQ-F1-5: owned create does NOT call getReleaseDetails (no WishlistRelease on owned path)', async () => {
      const ugRow = makeUgRow({ id: 'ug-owned', status: 'Playing' });
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-owned', igdbId: 9090, title: 'Owned' });
      (prisma.userGame.create as jest.Mock).mockResolvedValue(ugRow);

      await request(app)
        .post('/api/games/manual')
        .send({ igdbId: 9090, title: 'Owned', platformLabel: 'PC', status: 'Playing' });

      // Owned path skips IGDB release lookup entirely.
      expect(getReleaseDetails).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.wishlistRelease.create).not.toHaveBeenCalled();
    });
  });

  // ── UPDATE PATH — F1-PR5 CM12 + CM13 conflict matrix (Rows 3–6) ──

  describe('UPDATE path (existing UserGame — F1-PR5 conflict matrix)', () => {
    it('Row 3: existing owned, P already in playtimeByPlatform, new=owned → no-op on playtime', async () => {
      const existing = makeUgRow({
        id: 'ug-r3', gameId: 'game-r3', status: 'Playing',
        playtimeByPlatform: { PC: 300 },
      });
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-r3', igdbId: 333, title: 'Already Owned' });
      (prisma.userGame.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.userGame.update as jest.Mock).mockResolvedValue(existing);

      const res = await request(app)
        .post('/api/games/manual')
        .send({
          igdbId: 333, title: 'Already Owned', platformLabel: 'PC', status: 'Playing',
          manualPlaytimeMinutes: 60, // would seed if P were new
        });

      expect(res.status).toBe(200); // 200 on merge, not 201
      // Update happens but playtimeByPlatform is NOT in the data payload
      // (no-op on playtime when P is already a key).
      const updateCall = (prisma.userGame.update as jest.Mock).mock.calls[0]?.[0];
      expect(updateCall.data).not.toHaveProperty('playtimeByPlatform');
      expect(prisma.userGame.create).not.toHaveBeenCalled();
    });

    it('Row 4: existing owned, P NOT in playtimeByPlatform, new=owned → merges P in', async () => {
      const existing = makeUgRow({
        id: 'ug-r4', gameId: 'game-r4', status: 'Playing',
        playtimeByPlatform: { ST: 500 },
      });
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-r4', igdbId: 444, title: 'Multi-Platform Game' });
      (prisma.userGame.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.userGame.update as jest.Mock).mockResolvedValue(existing);

      await request(app)
        .post('/api/games/manual')
        .send({
          igdbId: 444, title: 'Multi-Platform Game', platformLabel: 'PS', status: 'Playing',
          manualPlaytimeMinutes: 120,
        });

      const updateCall = (prisma.userGame.update as jest.Mock).mock.calls[0]?.[0];
      // Existing ST playtime preserved + new PS key added with the manual minutes.
      expect(updateCall.data.playtimeByPlatform).toEqual({ ST: 500, PS: 120 });
    });

    it('Row 5: existing status=Wishlist + new=owned with playtime → CM13 auto-promote to OnHold (overrides user status pick)', async () => {
      const existing = makeUgRow({
        id: 'ug-r5', gameId: 'game-r5', status: 'Wishlist',
        playtimeByPlatform: {},
      });
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-r5', igdbId: 555, title: 'Was Wishlisted' });
      (prisma.userGame.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.userGame.update as jest.Mock).mockResolvedValue(existing);

      await request(app)
        .post('/api/games/manual')
        .send({
          igdbId: 555, title: 'Was Wishlisted', platformLabel: 'PC',
          // User picked 'Playing' but CM13 auto-promote overrides to OnHold/Backlog.
          status: 'Playing', manualPlaytimeMinutes: 60,
        });

      const updateCall = (prisma.userGame.update as jest.Mock).mock.calls[0]?.[0];
      // Auto-promoted to OnHold because merged playtime (60) > 0.
      expect(updateCall.data.status).toBe('OnHold');
      // Playtime merged.
      expect(updateCall.data.playtimeByPlatform).toEqual({ PC: 60 });
    });

    it('Row 5b: existing status=Wishlist + new=owned with NO playtime → CM13 auto-promote to Backlog', async () => {
      const existing = makeUgRow({
        id: 'ug-r5b', gameId: 'game-r5b', status: 'Wishlist',
        playtimeByPlatform: {},
      });
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-r5b', igdbId: 556, title: 'Was Wishlisted 2' });
      (prisma.userGame.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.userGame.update as jest.Mock).mockResolvedValue(existing);

      await request(app)
        .post('/api/games/manual')
        .send({
          igdbId: 556, title: 'Was Wishlisted 2', platformLabel: 'Switch', status: 'Backlog',
          // No manualPlaytimeMinutes → incoming playtime is 0
        });

      const updateCall = (prisma.userGame.update as jest.Mock).mock.calls[0]?.[0];
      // Auto-promoted to Backlog because merged playtime is 0.
      expect(updateCall.data.status).toBe('Backlog');
      expect(updateCall.data.playtimeByPlatform).toEqual({ Switch: 0 });
    });

    it('Row 6: existing status=Backlog + new=Wishlist → no-op on status (respects library decision)', async () => {
      const existing = makeUgRow({
        id: 'ug-r6', gameId: 'game-r6', status: 'Backlog',
        playtimeByPlatform: { PC: 100 },
      });
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-r6', igdbId: 666, title: 'Already In Library' });
      (prisma.userGame.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.userGame.update as jest.Mock).mockResolvedValue(existing);

      await request(app)
        .post('/api/games/manual')
        .send({ igdbId: 666, title: 'Already In Library', platformLabel: 'PC', status: 'Wishlist' });

      const updateCall = (prisma.userGame.update as jest.Mock).mock.calls[0]?.[0];
      // No status field in the update — the existing Backlog state survives.
      expect(updateCall.data).not.toHaveProperty('status');
      // Wishlist input doesn't touch playtime either.
      expect(updateCall.data).not.toHaveProperty('playtimeByPlatform');
      // OQ-F1-5 — update path never creates a WishlistRelease (only the
      // create+wishlist combo does, per the matrix).
      expect(getReleaseDetails).not.toHaveBeenCalled();
      expect(prisma.wishlistRelease.create).not.toHaveBeenCalled();
    });

    it('Row 5c: existing status=Wishlist + new=Wishlist → no-op on status (already wishlisted)', async () => {
      const existing = makeUgRow({
        id: 'ug-r5c', gameId: 'game-r5c', status: 'Wishlist',
        playtimeByPlatform: {},
      });
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-r5c', igdbId: 557, title: 'Still Wishlisted' });
      (prisma.userGame.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.userGame.update as jest.Mock).mockResolvedValue(existing);

      await request(app)
        .post('/api/games/manual')
        .send({ igdbId: 557, title: 'Still Wishlisted', platformLabel: 'PC', status: 'Wishlist' });

      const updateCall = (prisma.userGame.update as jest.Mock).mock.calls[0]?.[0];
      expect(updateCall.data).not.toHaveProperty('status');
    });

    it('Rows 3+4: user can bump status on a non-Wishlist re-add (Backlog → Playing)', async () => {
      // User had it on Backlog with no playtime; now re-adding as Playing
      // means they're starting it. Per CM12, user's explicit status pick wins
      // for non-Wishlist existing rows.
      const existing = makeUgRow({
        id: 'ug-bump', gameId: 'game-bump', status: 'Backlog',
        playtimeByPlatform: { PC: 0 },
      });
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-bump', igdbId: 700, title: 'Starting Now' });
      (prisma.userGame.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.userGame.update as jest.Mock).mockResolvedValue(existing);

      await request(app)
        .post('/api/games/manual')
        .send({ igdbId: 700, title: 'Starting Now', platformLabel: 'PC', status: 'Playing' });

      const updateCall = (prisma.userGame.update as jest.Mock).mock.calls[0]?.[0];
      expect(updateCall.data.status).toBe('Playing');
    });

    it('returns the full UserGameDetail shape (with userGameId at body.id) on merge', async () => {
      const existing = makeUgRow({
        id: 'ug-shape', gameId: 'game-shape', status: 'Backlog',
        playtimeByPlatform: { PC: 50 },
        igdbId: 800, title: 'Shape Check',
      });
      (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-shape', igdbId: 800, title: 'Shape Check' });
      (prisma.userGame.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.userGame.update as jest.Mock).mockResolvedValue(existing);

      const res = await request(app)
        .post('/api/games/manual')
        .send({ igdbId: 800, title: 'Shape Check', platformLabel: 'PC', status: 'Backlog' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('ug-shape');
      expect(res.body.gameId).toBe('game-shape');
      expect(res.body.game.igdbId).toBe(800);
      expect(res.body.status).toBe('Backlog');
      // wishlistedPlatforms is in the UserGameDetail shape too.
      expect(res.body.wishlistedPlatforms).toEqual([]);
    });
  });
});
