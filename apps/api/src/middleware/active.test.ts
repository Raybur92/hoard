// requireActive middleware — tests the closed-beta gate in isolation.
// Pending users hitting any gated route should get 403 PENDING_INVITE
// with a `hasRequestedAccess: boolean` field that drives the welcome
// screen state on the frontend.

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

jest.mock('@hoard/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

import { prisma } from '@hoard/db';
import { requireActive } from './active';

function makeApp() {
  const app = express();
  // Stand-in for requireUser: sets req.userId from a header so tests can vary it.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const id = req.header('x-test-user-id');
    if (id) (req as Request & { userId: string }).userId = id;
    next();
  });
  app.get('/gated', requireActive, (req: Request, res: Response) => {
    res.json({ ok: true, user: req.user });
  });
  return app;
}

describe('requireActive middleware', () => {
  let app: ReturnType<typeof makeApp>;

  beforeEach(() => {
    jest.resetAllMocks();
    app = makeApp();
  });

  it('returns 401 when req.userId is missing (defensive — auth chain misconfigured)', async () => {
    const res = await request(app).get('/gated');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthenticated');
    // Did not even reach the DB lookup.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns 401 when the user no longer exists in the DB', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app).get('/gated').set('x-test-user-id', 'ghost-user');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthenticated');
  });

  it('returns 403 PENDING_INVITE with hasRequestedAccess=false for a brand-new pending user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u-1', status: 'PENDING_INVITE', isAdmin: false, hasRequestedAccess: false,
    });

    const res = await request(app).get('/gated').set('x-test-user-id', 'u-1');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'PENDING_INVITE', hasRequestedAccess: false });
  });

  it('returns 403 PENDING_INVITE with hasRequestedAccess=true for a pending user who has requested access', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u-2', status: 'PENDING_INVITE', isAdmin: false, hasRequestedAccess: true,
    });

    const res = await request(app).get('/gated').set('x-test-user-id', 'u-2');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'PENDING_INVITE', hasRequestedAccess: true });
  });

  it('passes ACTIVE users through and populates req.user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u-3', status: 'ACTIVE', isAdmin: false, hasRequestedAccess: false,
    });

    const res = await request(app).get('/gated').set('x-test-user-id', 'u-3');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user).toEqual({ id: 'u-3', status: 'ACTIVE', isAdmin: false });
  });

  it('exposes isAdmin=true on req.user for admins', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'admin-1', status: 'ACTIVE', isAdmin: true, hasRequestedAccess: false,
    });

    const res = await request(app).get('/gated').set('x-test-user-id', 'admin-1');
    expect(res.status).toBe(200);
    expect(res.body.user.isAdmin).toBe(true);
  });

  it('selects only id/status/isAdmin/hasRequestedAccess (no other PII fetched)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u-4', status: 'ACTIVE', isAdmin: false, hasRequestedAccess: false,
    });

    await request(app).get('/gated').set('x-test-user-id', 'u-4');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-4' },
        select: { id: true, status: true, isAdmin: true, hasRequestedAccess: true },
      }),
    );
  });
});
