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
      deleteMany: jest.fn(),
    },
    platform: {
      upsert: jest.fn(),
    },
  },
}));

// Mock the auth middleware so that protected routes always receive a userId.
// Auth middleware behaviour is tested in isolation in middleware/user.test.ts.
jest.mock('../middleware/user', () => ({
  requireUser: (req: Request, _res: Response, next: NextFunction) => { (req as Request & { userId: string }).userId = 'test-user-id'; next(); },
  requireAuth: (req: Request, _res: Response, next: NextFunction) => { (req as Request & { userId: string }).userId = 'test-user-id'; next(); },
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
