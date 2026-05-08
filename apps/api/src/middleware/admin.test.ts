// requireAdmin middleware — tests the admin gate in isolation.
// Per I-D15: returns 404 (NOT 403) when the user is not an admin,
// with the canonical project 404 body `{ error: 'Not found' }`.

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

import { requireAdmin } from './admin';

function makeApp(user?: { id: string; status: 'ACTIVE'; isAdmin: boolean }) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (user) (req as Request & { user: typeof user }).user = user;
    next();
  });
  app.get('/admin-only', requireAdmin, (_req: Request, res: Response) => {
    res.json({ ok: true });
  });
  return app;
}

describe('requireAdmin middleware', () => {
  it('returns 401 when req.user is missing (defensive — chain misconfigured)', async () => {
    const res = await request(makeApp()).get('/admin-only');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthenticated' });
  });

  it('returns 404 with the canonical body for a non-admin user', async () => {
    const res = await request(makeApp({ id: 'u-1', status: 'ACTIVE', isAdmin: false })).get('/admin-only');
    expect(res.status).toBe(404);
    // Byte-identical to the canonical 404 used elsewhere in the API
    // (per I-D15 — admin surface stays invisible to non-admins).
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('passes admin users through', async () => {
    const res = await request(makeApp({ id: 'admin-1', status: 'ACTIVE', isAdmin: true })).get('/admin-only');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
