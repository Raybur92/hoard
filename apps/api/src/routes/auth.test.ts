// Stop dotenv (loaded by apps/api/src/index.ts) from injecting the dev .env
// during tests — we want a deterministic env regardless of the developer's
// local config. The auth.ts module reads OAuth credentials at load time, so
// the test for "501 when GOOGLE_CLIENT_ID is not configured" only passes if
// GOOGLE_CLIENT_ID is absent when auth.ts loads.
jest.mock('dotenv/config', () => ({}));
delete process.env['GOOGLE_CLIENT_ID'];
delete process.env['GOOGLE_CLIENT_SECRET'];
delete process.env['STEAM_API_KEY'];

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

function makeSessionCookie(userId = 'test-user-id'): string {
  // Use the same secret the loaded module uses — dotenv has already run by this point.
  const secret = process.env['JWT_SECRET'] ?? 'dev-secret';
  const token = jwt.sign({ sub: userId }, secret, { expiresIn: '1h' });
  return `session=${token}`;
}

// Mock prisma before anything loads the route handlers.
jest.mock('@hoard/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    platform: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    userGame: {
      deleteMany: jest.fn(),
    },
    inviteCode: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

// Mock the auth middleware so that protected routes always receive a userId.
// Auth middleware behaviour is tested in isolation in middleware/user.test.ts.
jest.mock('../middleware/user', () => ({
  requireUser: (req: Request, _res: Response, next: NextFunction) => { (req as Request & { userId: string }).userId = 'test-user-id'; next(); },
  requireAuth: (req: Request, _res: Response, next: NextFunction) => { (req as Request & { userId: string }).userId = 'test-user-id'; next(); },
}));

// Mock requireActive — the gate is tested in isolation in
// middleware/active.test.ts. Here we just want gated routes to pass through
// as if the user were ACTIVE, so the route logic itself is exercised.
jest.mock('../middleware/active', () => ({
  requireActive: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { id: string; status: 'ACTIVE'; isAdmin: boolean } }).user = {
      id: 'test-user-id', status: 'ACTIVE', isAdmin: false,
    };
    next();
  },
}));

import { app } from '../index';
import { prisma } from '@hoard/db';

const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  password: '$2a$12$placeholder',
  createdAt: new Date('2024-01-01'),
  googleId: null as string | null,
  steamId: null as string | null,
  // Closed-beta gating fields (I1 schema). Default to ACTIVE so existing
  // tests stay green; tests that need to exercise PENDING_INVITE redirects
  // override this explicitly via spreads.
  status: 'ACTIVE' as 'PENDING_INVITE' | 'ACTIVE',
  isAdmin: false,
  hasRequestedAccess: false,
  accessRequestMessage: null as string | null,
  accessRequestedAt: null as Date | null,
  hypeThreshold: 5,
  libraryView: 'shelves',
  showHltb: true,
  coverDensity: 'standard',
  terminalCursor: true,
};

function sessionCookies(res: request.Response): string[] {
  return (res.headers['set-cookie'] as string[] | undefined) ?? [];
}

beforeEach(() => {
  jest.resetAllMocks();
  global.fetch = jest.fn() as typeof global.fetch;
});

/* ── register ── */

describe('POST /api/auth/register', () => {
  it('creates a user and returns 201 with a session cookie', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('test@example.com');
    expect(sessionCookies(res).some((c) => c.startsWith('session='))).toBe(true);
  });

  it('returns 400 for an invalid email address', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when the password is shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });

  it('returns 409 when the email is already registered', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });
});

/* ── login ── */

describe('POST /api/auth/login', () => {
  it('returns 200 with a session cookie for correct credentials', async () => {
    const bcrypt = await import('bcryptjs');
    const hashed = await bcrypt.hash('correctpassword', 1);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...mockUser, password: hashed });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'correctpassword' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('test@example.com');
    expect(sessionCookies(res).some((c) => c.startsWith('session='))).toBe(true);
  });

  it('returns 401 for a wrong password', async () => {
    const bcrypt = await import('bcryptjs');
    const hashed = await bcrypt.hash('correctpassword', 1);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...mockUser, password: hashed });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('returns 401 for an unknown email', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
  });

  it('returns 400 for a missing email field', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'password123' });

    expect(res.status).toBe(400);
  });
});

/* ── logout ── */

describe('POST /api/auth/logout', () => {
  it('returns 200 and clears the session cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const cleared = sessionCookies(res).find((c) => c.startsWith('session='));
    // cookie is cleared: value is empty or expires in the past
    expect(cleared).toMatch(/session=;|Max-Age=0/);
  });
});

/* ── me ── */

describe('GET /api/auth/me', () => {
  it('returns the current user for an authenticated request', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe('test-user-id');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'test-user-id' } }),
    );
  });

  it('returns 404 when the user record does not exist', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(404);
  });

  it('sets a short Cache-Control header on success (F8)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=10');
  });
});

/* ── update me ── */

describe('PATCH /api/auth/me', () => {
  it('updates the display name', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue({ ...mockUser, name: 'New Name' });

    const res = await request(app)
      .patch('/api/auth/me')
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('New Name');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'New Name' } }),
    );
  });
});

/* ── Google OAuth ── */

describe('GET /api/auth/google', () => {
  it('returns 501 when GOOGLE_CLIENT_ID is not configured', async () => {
    // The route module reads GOOGLE_CLIENT_ID at load time into a module-level const.
    // Without the env var set, it defaults to '' and the route returns 501.
    const res = await request(app).get('/api/auth/google');
    expect(res.status).toBe(501);
  });
});

describe('GET /api/auth/google/callback', () => {
  it('redirects to /login?error=google_failed when no code param is present', async () => {
    const res = await request(app).get('/api/auth/google/callback');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/login\?error=google_failed/);
  });

  it('creates a new user and sets a session cookie on successful OAuth exchange', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'mock-access-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'g-123', email: 'google@example.com', name: 'Google User' }),
      });

    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue({ ...mockUser, googleId: 'g-123' });

    const res = await request(app).get('/api/auth/google/callback?code=auth-code-abc');
    expect(res.status).toBe(302);
    expect(res.headers['location']).not.toMatch(/error=/);
    expect(sessionCookies(res).some((c) => c.startsWith('session='))).toBe(true);
  });

  it('redirects to /login?error=google_failed when the token exchange fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });

    const res = await request(app).get('/api/auth/google/callback?code=bad-code');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/error=google_failed/);
  });
});

/* ── Steam OpenID ── */

describe('GET /api/auth/steam', () => {
  it('redirects to the Steam OpenID login URL', async () => {
    const res = await request(app).get('/api/auth/steam');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/steamcommunity\.com\/openid\/login/);
  });
});

describe('GET /api/auth/steam/callback', () => {
  const baseParams = new URLSearchParams({
    'openid.mode': 'id_res',
    'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561198012345678',
    'openid.ns': 'http://specs.openid.net/auth/2.0',
  });

  it('redirects to /login?error=steam_failed when openid.mode is not id_res', async () => {
    const res = await request(app).get('/api/auth/steam/callback?openid.mode=cancel');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/error=steam_failed/);
  });

  it('redirects to /login?error=steam_failed when Steam assertion verification fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () => 'is_valid:false\n',
    });

    const res = await request(app).get(`/api/auth/steam/callback?${baseParams}`);
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/error=steam_failed/);
  });

  it('creates a new user and sets a session cookie on a valid Steam login', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () => 'is_valid:true\n',
    });

    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue({
      ...mockUser,
      steamId: '76561198012345678',
      email: 'steam:76561198012345678@hoard.internal',
    });

    const res = await request(app).get(`/api/auth/steam/callback?${baseParams}`);
    expect(res.status).toBe(302);
    expect(res.headers['location']).not.toMatch(/error=/);
    expect(sessionCookies(res).some((c) => c.startsWith('session='))).toBe(true);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ steamId: '76561198012345678' }),
      }),
    );
  });

  it('logs in an existing Steam user without creating a new record', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () => 'is_valid:true\n',
    });

    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...mockUser,
      steamId: '76561198012345678',
    });

    const res = await request(app).get(`/api/auth/steam/callback?${baseParams}`);
    expect(res.status).toBe(302);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(sessionCookies(res).some((c) => c.startsWith('session='))).toBe(true);
  });

  it('connect mode: updates current user and upserts Platform when session cookie is present', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () => 'is_valid:true\n',
    });

    (prisma.user.update as jest.Mock).mockResolvedValue({ ...mockUser, steamId: '76561198012345678' });
    (prisma.platform.upsert as jest.Mock).mockResolvedValue({ id: 'plat-1' });

    const res = await request(app)
      .get(`/api/auth/steam/callback?${baseParams}`)
      .set('Cookie', makeSessionCookie('test-user-id'));

    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/\/settings\/platforms\/st$/);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ steamId: '76561198012345678' }) }),
    );
    expect(prisma.platform.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ code: 'ST', userId: 'test-user-id' }) }),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

/* ── Google connect mode ── */

describe('GET /api/auth/google/callback — connect mode', () => {
  it('updates current user googleId and redirects to /settings when session cookie is present', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'g-999', email: 'g@example.com', name: 'G' }) });

    (prisma.user.update as jest.Mock).mockResolvedValue({ ...mockUser, googleId: 'g-999' });

    const res = await request(app)
      .get('/api/auth/google/callback?code=auth-code')
      .set('Cookie', makeSessionCookie('test-user-id'));

    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/\/settings$/);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ googleId: 'g-999' }) }),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

/* ── wipe-library (PR C — D10) ── */

describe('POST /api/auth/me/wipe-library', () => {
  it('deletes UserGames and Platforms in a transaction; returns counts', async () => {
    (prisma.$transaction as jest.Mock).mockResolvedValue([
      { count: 488 }, // UserGame deleteMany
      { count: 2 },   // Platform deleteMany
    ]);

    const res = await request(app)
      .post('/api/auth/me/wipe-library')
      .set('Cookie', makeSessionCookie('test-user-id'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, gamesDeleted: 488, platformsDisconnected: 2 });

    // The transaction received the two deleteMany calls — covered by the
    // mock above. Confirms the route went through prisma.$transaction.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does not touch User, Game, HltbData, or WishlistRelease tables', async () => {
    (prisma.$transaction as jest.Mock).mockResolvedValue([{ count: 0 }, { count: 0 }]);

    await request(app)
      .post('/api/auth/me/wipe-library')
      .set('Cookie', makeSessionCookie('test-user-id'));

    // Per D10: wipe-library is library + platforms only. Account, prefs,
    // wishlist, and shared Game/HltbData rows must stay.
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(prisma.user.deleteMany).not.toHaveBeenCalled();
  });
});

/* ── redeem-invite (I2) ── */

describe('POST /api/auth/redeem-invite', () => {
  it('returns 400 for a malformed code (does not hit the database)', async () => {
    const res = await request(app)
      .post('/api/auth/redeem-invite')
      .send({ code: 'not-a-real-code' });

    expect(res.status).toBe(400);
    expect(prisma.inviteCode.findUnique).not.toHaveBeenCalled();
  });

  it('returns 400 for a code with the right shape but lowercase letters', async () => {
    // Reduced alphabet is uppercase A-Z + 2-9. Lowercase must be rejected.
    const res = await request(app)
      .post('/api/auth/redeem-invite')
      .send({ code: 'HOARD-abcd-efgh' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a code containing the banned 0/O/1/I characters', async () => {
    const res = await request(app)
      .post('/api/auth/redeem-invite')
      .send({ code: 'HOARD-O0I1-2345' });
    expect(res.status).toBe(400);
  });

  it('returns 409 CODE_NOT_FOUND when the code does not exist', async () => {
    (prisma.inviteCode.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/redeem-invite')
      .send({ code: 'HOARD-7K2M-PLAY' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CODE_NOT_FOUND');
  });

  it('returns 409 CODE_ALREADY_REDEEMED when usedById is already set', async () => {
    (prisma.inviteCode.findUnique as jest.Mock).mockResolvedValue({
      id: 'code-1', code: 'HOARD-7K2M-PLAY', usedById: 'someone-else', usedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/auth/redeem-invite')
      .send({ code: 'HOARD-7K2M-PLAY' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CODE_ALREADY_REDEEMED');
  });

  it('redeems an unused code: flips User.status to ACTIVE inside a transaction and returns the user', async () => {
    (prisma.inviteCode.findUnique as jest.Mock).mockResolvedValue({
      id: 'code-1', code: 'HOARD-7K2M-PLAY', usedById: null, usedAt: null,
    });
    // $transaction(callback): exercise the callback by passing in a tx with
    // updateMany returning count=1 (winner) and user.update succeeding.
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        inviteCode: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        user: { update: jest.fn().mockResolvedValue({ ...mockUser, status: 'ACTIVE' }) },
      };
      await cb(tx);
      // Assert the redemption used the predicate-based update — proving
      // the WHERE usedById IS NULL guard is in place at the callsite.
      expect(tx.inviteCode.updateMany).toHaveBeenCalledWith({
        where: { id: 'code-1', usedById: null },
        data: { usedById: 'test-user-id', usedAt: expect.any(Date) },
      });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'test-user-id' },
        data: { status: 'ACTIVE' },
      });
    });
    // After the transaction commits, the route refetches the fresh user.
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...mockUser, status: 'ACTIVE' });

    const res = await request(app)
      .post('/api/auth/redeem-invite')
      .send({ code: 'HOARD-7K2M-PLAY' });

    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe('ACTIVE');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  // Race-condition test — REAL parallel calls via Promise.all (per Andrea's
  // pre-commit reminder #2). A serial test that calls redeem twice doesn't
  // prove the WHERE usedById IS NULL predicate is doing its job; this one
  // does, by simulating two requests both passing the findUnique check
  // (both see usedById: null) and then racing to the updateMany. Stateful
  // mock guarantees exactly one updateMany call returns count=1 (winner)
  // and the rest return count=0 (losers, surface 409).
  it('serializes parallel redemptions: exactly one wins, the rest get 409', async () => {
    // Both findUnique calls see the code as unredeemed — this is the race
    // window the predicate exists to close.
    (prisma.inviteCode.findUnique as jest.Mock).mockResolvedValue({
      id: 'code-race', code: 'HOARD-RACE-TEST', usedById: null, usedAt: null,
    });

    // Stateful mock: the first updateMany call sees usedById=null and
    // returns count=1; subsequent calls see the redeemed state and return
    // count=0. This mirrors what Postgres does with the predicate guard.
    let redeemed = false;
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        inviteCode: {
          updateMany: jest.fn().mockImplementation(async () => {
            if (redeemed) return { count: 0 };
            redeemed = true;
            return { count: 1 };
          }),
        },
        user: { update: jest.fn().mockResolvedValue({ ...mockUser, status: 'ACTIVE' }) },
      };
      return cb(tx);
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...mockUser, status: 'ACTIVE' });

    // Fire two parallel requests with the same code. The race is real —
    // both supertest agents go through the full route handler concurrently.
    const [r1, r2] = await Promise.all([
      request(app).post('/api/auth/redeem-invite').send({ code: 'HOARD-RACE-TEST' }),
      request(app).post('/api/auth/redeem-invite').send({ code: 'HOARD-RACE-TEST' }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body.error).toBe('CODE_ALREADY_REDEEMED');

    const winner = r1.status === 200 ? r1 : r2;
    expect(winner.body.user.status).toBe('ACTIVE');
  });
});

/* ── request-access (I2) ── */

describe('POST /api/auth/request-access', () => {
  it('first call sets hasRequestedAccess=true and stores the message + timestamp', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/api/auth/request-access')
      .send({ message: 'Hi, I am Marco — Luigi told me about Hoard.' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'test-user-id' },
      data: {
        hasRequestedAccess: true,
        accessRequestMessage: 'Hi, I am Marco — Luigi told me about Hoard.',
        accessRequestedAt: expect.any(Date),
      },
    });
  });

  it('accepts a 500-character message exactly at the cap', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);
    const message = 'x'.repeat(500);

    const res = await request(app).post('/api/auth/request-access').send({ message });

    expect(res.status).toBe(200);
    expect((prisma.user.update as jest.Mock).mock.calls[0][0].data.accessRequestMessage).toBe(message);
  });

  it('rejects a 501-character message with 400', async () => {
    const message = 'x'.repeat(501);

    const res = await request(app).post('/api/auth/request-access').send({ message });

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('accepts an empty body — message is optional, stores null', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

    const res = await request(app).post('/api/auth/request-access').send({});

    expect(res.status).toBe(200);
    expect((prisma.user.update as jest.Mock).mock.calls[0][0].data.accessRequestMessage).toBeNull();
  });

  it('idempotency: a second call overwrites accessRequestMessage and refreshes accessRequestedAt', async () => {
    (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

    await request(app).post('/api/auth/request-access').send({ message: 'first message' });
    await request(app).post('/api/auth/request-access').send({ message: 'second message' });

    expect(prisma.user.update).toHaveBeenCalledTimes(2);
    const firstArgs = (prisma.user.update as jest.Mock).mock.calls[0][0].data;
    const secondArgs = (prisma.user.update as jest.Mock).mock.calls[1][0].data;
    expect(firstArgs.accessRequestMessage).toBe('first message');
    expect(secondArgs.accessRequestMessage).toBe('second message');
    // Both calls should have set hasRequestedAccess=true (append-only flag).
    expect(firstArgs.hasRequestedAccess).toBe(true);
    expect(secondArgs.hasRequestedAccess).toBe(true);
  });
});
