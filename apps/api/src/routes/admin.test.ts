// I3 admin-routes tests. Covers requireAdmin gating (404 with canonical
// body for non-admins) and all four endpoints. Mocks the auth chain
// (requireUser + requireActive) and toggles isAdmin per test via a
// mutable flag the requireActive mock reads.

jest.mock('dotenv/config', () => ({}));

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

let testIsAdmin = true;

jest.mock('@hoard/db', () => ({
  prisma: {
    user: { findMany: jest.fn() },
    inviteCode: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('../middleware/user', () => ({
  requireUser: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { userId: string }).userId = 'admin-id';
    next();
  },
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { userId: string }).userId = 'admin-id';
    next();
  },
}));

jest.mock('../middleware/active', () => ({
  requireActive: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { id: string; status: 'ACTIVE'; isAdmin: boolean } }).user = {
      id: 'admin-id', status: 'ACTIVE', isAdmin: testIsAdmin,
    };
    next();
  },
}));

import { app } from '../index';
import { prisma } from '@hoard/db';
import { Prisma } from '@prisma/client';

beforeEach(() => {
  jest.resetAllMocks();
  testIsAdmin = true; // default; non-admin tests flip it
});

/* ── Non-admin gating (I-D15) ── */

describe('requireAdmin gating returns canonical 404 for non-admins on every admin route', () => {
  beforeEach(() => { testIsAdmin = false; });

  it('GET  /api/admin/users → 404 { error: "Not found" }', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('GET  /api/admin/invite-codes → 404 { error: "Not found" }', async () => {
    const res = await request(app).get('/api/admin/invite-codes');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('POST /api/admin/invite-codes → 404 { error: "Not found" }', async () => {
    const res = await request(app).post('/api/admin/invite-codes').send({});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('DELETE /api/admin/invite-codes/:id → 404 { error: "Not found" }', async () => {
    const res = await request(app).delete('/api/admin/invite-codes/some-id');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});

/* ── GET /api/admin/users ── */

const mkUser = (overrides: Partial<{
  id: string; email: string; name: string | null; steamId: string | null;
  createdAt: Date; status: 'PENDING_INVITE' | 'ACTIVE'; isAdmin: boolean;
  hasRequestedAccess: boolean; accessRequestMessage: string | null;
  accessRequestedAt: Date | null;
  redeemedInviteCode: { code: string; usedAt: Date | null } | null;
  platforms: { code: string }[];
}>) => ({
  id: overrides.id ?? 'u-1',
  email: overrides.email ?? 'a@example.com',
  name: overrides.name ?? null,
  steamId: overrides.steamId ?? null,
  createdAt: overrides.createdAt ?? new Date('2026-05-01T00:00:00Z'),
  status: overrides.status ?? 'ACTIVE',
  isAdmin: overrides.isAdmin ?? false,
  hasRequestedAccess: overrides.hasRequestedAccess ?? false,
  accessRequestMessage: overrides.accessRequestMessage ?? null,
  accessRequestedAt: overrides.accessRequestedAt ?? null,
  redeemedInviteCode: overrides.redeemedInviteCode ?? null,
  platforms: overrides.platforms ?? [],
});

describe('GET /api/admin/users', () => {
  it('returns the full admin shape including displayIdentity, redeemedCode, and platform summary', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      mkUser({
        id: 'andrea-id',
        email: 'andrea@example.com',
        name: 'Andrea',
        status: 'ACTIVE',
        isAdmin: true,
        platforms: [{ code: 'ST' }, { code: 'PS' }],
        redeemedInviteCode: { code: 'HOARD-TEST-CODE', usedAt: new Date('2026-05-08') },
      }),
    ]);

    const res = await request(app).get('/api/admin/users');

    expect(res.status).toBe(200);
    const u = res.body.users[0];
    expect(u.displayIdentity).toBe('andrea@example.com');
    expect(u.platforms).toEqual({ count: 2, codes: ['ST', 'PS'] });
    expect(u.redeemedCode).toEqual({ code: 'HOARD-TEST-CODE', usedAt: '2026-05-08T00:00:00.000Z' });
    expect(u.isAdmin).toBe(true);
  });

  it('renders Steam-synthetic users with displayIdentity = "Steam user — {steamId}"', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      mkUser({
        id: 'steam-u',
        email: 'steam:76561198012345678@hoard.internal',
        name: 'Bedkarma',
        steamId: '76561198012345678',
      }),
    ]);

    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.users[0].displayIdentity).toBe('Steam user — 76561198012345678');
  });

  it('sorts pending-with-request first (by accessRequestedAt desc), then everyone else by createdAt desc', async () => {
    // Each createdAt is set explicitly + unambiguously (full ISO + Z) so
    // the sort comparison is deterministic regardless of TZ.
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      mkUser({ id: 'old-active',  status: 'ACTIVE',         createdAt: new Date('2026-04-01T00:00:00Z') }),
      mkUser({ id: 'newer-active', status: 'ACTIVE',         createdAt: new Date('2026-05-05T00:00:00Z') }),
      mkUser({ id: 'pending-old',  status: 'PENDING_INVITE', hasRequestedAccess: true, accessRequestedAt: new Date('2026-05-07T00:00:00Z'), createdAt: new Date('2026-05-06T00:00:00Z') }),
      mkUser({ id: 'pending-new',  status: 'PENDING_INVITE', hasRequestedAccess: true, accessRequestedAt: new Date('2026-05-08T00:00:00Z'), createdAt: new Date('2026-05-07T00:00:00Z') }),
      mkUser({ id: 'pending-no-request', status: 'PENDING_INVITE', hasRequestedAccess: false, createdAt: new Date('2026-03-01T00:00:00Z') }),
    ]);

    const res = await request(app).get('/api/admin/users');
    const order = res.body.users.map((u: { id: string }) => u.id);

    // Pending-with-request first (newest first), then everyone else by
    // createdAt desc. Pending-no-request goes in the "everyone else"
    // bucket since it didn't ask for access.
    expect(order.slice(0, 2)).toEqual(['pending-new', 'pending-old']);
    // Index 2-4: by createdAt desc among the rest.
    // newer-active (2026-05-05) > old-active (2026-04-01) > pending-no-request (2026-03-01)
    expect(order.slice(2)).toEqual(['newer-active', 'old-active', 'pending-no-request']);
  });
});

/* ── GET /api/admin/invite-codes ── */

const mkCode = (overrides: Partial<{
  id: string; code: string; note: string | null;
  createdAt: Date; usedAt: Date | null;
  usedBy: { id: string; email: string; steamId: string | null } | null;
}>) => ({
  id: overrides.id ?? 'c-1',
  code: overrides.code ?? 'HOARD-TEST-AAAA',
  note: overrides.note ?? null,
  createdAt: overrides.createdAt ?? new Date('2026-05-01'),
  usedAt: overrides.usedAt ?? null,
  usedById: overrides.usedBy?.id ?? null,
  usedBy: overrides.usedBy ?? null,
});

describe('GET /api/admin/invite-codes', () => {
  it('returns the full shape with usedBy.displayIdentity for redeemed codes', async () => {
    (prisma.inviteCode.findMany as jest.Mock).mockResolvedValue([
      mkCode({
        id: 'c-1', code: 'HOARD-7K2M-PLAY', note: 'for marco',
        usedAt: new Date('2026-05-08'),
        usedBy: { id: 'marco-id', email: 'marco@example.com', steamId: null },
      }),
    ]);

    const res = await request(app).get('/api/admin/invite-codes');
    expect(res.status).toBe(200);
    const c = res.body.codes[0];
    expect(c.code).toBe('HOARD-7K2M-PLAY');
    expect(c.note).toBe('for marco');
    expect(c.usedBy).toEqual({
      id: 'marco-id', email: 'marco@example.com', displayIdentity: 'marco@example.com',
    });
  });

  it('returns usedBy = null for unused codes', async () => {
    (prisma.inviteCode.findMany as jest.Mock).mockResolvedValue([
      mkCode({ id: 'c-2', code: 'HOARD-XQ4N-9TBR', note: 'spare' }),
    ]);

    const res = await request(app).get('/api/admin/invite-codes');
    expect(res.body.codes[0].usedBy).toBeNull();
  });

  it('sorts unused first, then used by usedAt desc', async () => {
    (prisma.inviteCode.findMany as jest.Mock).mockResolvedValue([
      mkCode({ id: 'used-old',   usedAt: new Date('2026-05-01'), usedBy: { id: 'u1', email: 'a@x.com', steamId: null } }),
      mkCode({ id: 'used-new',   usedAt: new Date('2026-05-08'), usedBy: { id: 'u2', email: 'b@x.com', steamId: null } }),
      mkCode({ id: 'unused-old', createdAt: new Date('2026-04-01') }),
      mkCode({ id: 'unused-new', createdAt: new Date('2026-05-08') }),
    ]);

    const res = await request(app).get('/api/admin/invite-codes');
    const order = res.body.codes.map((c: { id: string }) => c.id);
    // Unused first (most-recently-created), then used (most-recently-used).
    expect(order).toEqual(['unused-new', 'unused-old', 'used-new', 'used-old']);
  });
});

/* ── POST /api/admin/invite-codes ── */

describe('POST /api/admin/invite-codes', () => {
  it('returns 201 with a freshly-minted code matching the regex', async () => {
    (prisma.inviteCode.create as jest.Mock).mockImplementation(async ({ data }: { data: { code: string; note?: string } }) => ({
      id: 'c-new', code: data.code, note: data.note ?? null, createdAt: new Date('2026-05-08'), usedAt: null, usedById: null,
    }));

    const res = await request(app).post('/api/admin/invite-codes').send({ note: 'for marco' });
    expect(res.status).toBe(201);
    expect(res.body.code.code).toMatch(/^HOARD-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(res.body.code.note).toBe('for marco');
    expect(res.body.code.usedAt).toBeNull();
    expect(res.body.code.usedBy).toBeNull();
  });

  it('accepts an empty body — note is optional', async () => {
    (prisma.inviteCode.create as jest.Mock).mockImplementation(async ({ data }: { data: { code: string } }) => ({
      id: 'c-new', code: data.code, note: null, createdAt: new Date('2026-05-08'), usedAt: null, usedById: null,
    }));

    const res = await request(app).post('/api/admin/invite-codes').send({});
    expect(res.status).toBe(201);
    expect(res.body.code.note).toBeNull();
  });

  it('rejects a 101-character note with 400', async () => {
    const note = 'x'.repeat(101);
    const res = await request(app).post('/api/admin/invite-codes').send({ note });
    expect(res.status).toBe(400);
    expect(prisma.inviteCode.create).not.toHaveBeenCalled();
  });

  it('retries on P2002 collision and succeeds on a later attempt', async () => {
    let attempt = 0;
    (prisma.inviteCode.create as jest.Mock).mockImplementation(async ({ data }: { data: { code: string } }) => {
      attempt++;
      if (attempt < 3) {
        // Simulate the unique-constraint collision Prisma surfaces.
        const e = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002', clientVersion: '6.0.0',
        });
        throw e;
      }
      return { id: 'c-new', code: data.code, note: null, createdAt: new Date(), usedAt: null, usedById: null };
    });

    const res = await request(app).post('/api/admin/invite-codes').send({});
    expect(res.status).toBe(201);
    expect(prisma.inviteCode.create).toHaveBeenCalledTimes(3);
  });

  it('gives up after 5 collisions and returns 500', async () => {
    (prisma.inviteCode.create as jest.Mock).mockImplementation(async () => {
      const e = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002', clientVersion: '6.0.0',
      });
      throw e;
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).post('/api/admin/invite-codes').send({});
    expect(res.status).toBe(500);
    expect(prisma.inviteCode.create).toHaveBeenCalledTimes(5);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

/* ── DELETE /api/admin/invite-codes/:id ── */

describe('DELETE /api/admin/invite-codes/:id', () => {
  it('returns 204 and deletes the code when it is unused', async () => {
    (prisma.inviteCode.findUnique as jest.Mock).mockResolvedValue({
      id: 'c-1', code: 'HOARD-XQ4N-9TBR', usedById: null, usedAt: null,
    });
    (prisma.inviteCode.delete as jest.Mock).mockResolvedValue({});

    const res = await request(app).delete('/api/admin/invite-codes/c-1');
    expect(res.status).toBe(204);
    expect(prisma.inviteCode.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
  });

  it('returns 404 when the code does not exist', async () => {
    (prisma.inviteCode.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app).delete('/api/admin/invite-codes/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
    expect(prisma.inviteCode.delete).not.toHaveBeenCalled();
  });

  it('returns 409 CODE_ALREADY_USED when the code has been redeemed', async () => {
    (prisma.inviteCode.findUnique as jest.Mock).mockResolvedValue({
      id: 'c-used', code: 'HOARD-7K2M-PLAY', usedById: 'someone-id', usedAt: new Date(),
    });

    const res = await request(app).delete('/api/admin/invite-codes/c-used');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CODE_ALREADY_USED');
    expect(prisma.inviteCode.delete).not.toHaveBeenCalled();
  });
});
