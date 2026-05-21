// TL1.3 tests for GET /api/admin/events. Mirrors the admin.feedback.test.ts
// mock chain (testIsAdmin flag flipped per test for the requireAdmin
// gating cases). Five tests per the §3.7 spec — admin-only / cursor /
// userId filter / event filter / empty shape.

jest.mock('dotenv/config', () => ({}));

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

let testIsAdmin = true;

jest.mock('@hoard/db', () => ({
  prisma: {
    userEvent: {
      findMany: jest.fn(),
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

beforeEach(() => {
  jest.resetAllMocks();
  testIsAdmin = true;
});

const mkRow = (overrides: Partial<{
  id: string; userId: string; event: string;
  details: unknown; createdAt: Date;
  user: { id: string; email: string; name: string | null; steamId: string | null };
}> = {}) => ({
  id: 'evt_1',
  userId: 'usr_1',
  event: 'wishlist.toggled',
  details: { igdbId: 12345, action: 'add' },
  createdAt: new Date('2026-05-21T12:00:00.000Z'),
  user: {
    id: 'usr_1',
    email: 'luigi@example.com',
    name: 'Luigi',
    steamId: null,
  },
  ...overrides,
});

describe('requireAdmin gating on GET /api/admin/events', () => {
  it('returns 404 { error: "Not found" } for non-admins', async () => {
    testIsAdmin = false;
    const res = await request(app).get('/api/admin/events');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
    expect(prisma.userEvent.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/events — cursor pagination', () => {
  it('returns a nextCursor when there is more data; null when the page is the last one', async () => {
    // 51 rows → page yields 50 + the 51st triggers hasMore. The route
    // slices to 50 and emits the 50th's id as nextCursor.
    const rows = Array.from({ length: 51 }, (_, i) =>
      mkRow({ id: `evt_${i + 1}`, createdAt: new Date(2026, 4, 21, 12, 0, 0, i) }),
    );
    (prisma.userEvent.findMany as jest.Mock).mockResolvedValueOnce(rows);

    const firstPage = await request(app).get('/api/admin/events');
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items).toHaveLength(50);
    expect(firstPage.body.nextCursor).toBe('evt_50');
    // Stability invariant — the secondary-sort-by-id ordering.
    expect((prisma.userEvent.findMany as jest.Mock).mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);

    // Second page: 30 rows returned → fewer than 51 → nextCursor null.
    (prisma.userEvent.findMany as jest.Mock).mockResolvedValueOnce(rows.slice(0, 30));
    const secondPage = await request(app).get('/api/admin/events?cursor=evt_50');
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.nextCursor).toBeNull();
    // Cursor argument was forwarded to Prisma.
    const secondCallArgs = (prisma.userEvent.findMany as jest.Mock).mock.calls[1][0];
    expect(secondCallArgs).toMatchObject({ cursor: { id: 'evt_50' }, skip: 1 });
  });
});

describe('GET /api/admin/events — filters', () => {
  it('forwards ?userId= to Prisma as a where filter', async () => {
    (prisma.userEvent.findMany as jest.Mock).mockResolvedValueOnce([
      mkRow({ id: 'evt_for_luigi', userId: 'usr_luigi' }),
    ]);

    const res = await request(app).get('/api/admin/events?userId=usr_luigi');
    expect(res.status).toBe(200);

    const args = (prisma.userEvent.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where).toEqual({ userId: 'usr_luigi' });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].userId).toBe('usr_luigi');
  });

  it('forwards ?event= to Prisma as a where filter (event-class slice)', async () => {
    (prisma.userEvent.findMany as jest.Mock).mockResolvedValueOnce([
      mkRow({ event: 'sync.first' }),
    ]);

    const res = await request(app).get('/api/admin/events?event=sync.first');
    expect(res.status).toBe(200);

    const args = (prisma.userEvent.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where).toEqual({ event: 'sync.first' });
    expect(res.body.items[0].event).toBe('sync.first');
  });
});

describe('GET /api/admin/events — empty result shape', () => {
  it('returns { items: [], nextCursor: null } when no rows match', async () => {
    (prisma.userEvent.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app).get('/api/admin/events');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });
});

describe('GET /api/admin/events — same-timestamp cursor stability', () => {
  // This test looks paranoid — same-timestamp cursor stability is
  // covered transitively by Test 2's orderBy contract assertion. It
  // exists for the day a regression delivers the tiebreaker silently:
  // a future refactor might decide the secondary `id desc` sort "looks
  // redundant" and drop it; this test fails the moment that happens,
  // because the mock-controlled boundary still lands but the contract
  // assertion underneath catches the orderBy drift. Same shape of
  // belt-and-suspenders coverage as F1.4's feedback list precedent.
  // Don't delete as redundant. References TL-D10 cursor-stability
  // invariant in docs/TELEMETRY_PLAN.md §3.3.
  it('handles 51 rows with identical createdAt — page boundary is deterministic via id-desc tiebreaker', async () => {
    // Two events fired by one request handler can land in the same
    // millisecond (e.g. session.opened + signup.pending on a brand-new
    // login). The [createdAt desc, id desc] orderBy is what keeps the
    // cursor boundary deterministic in that case — without the id
    // tiebreaker, Prisma's cursor + skip:1 could land on either of
    // the tied rows.
    //
    // The mock returns 51 rows pre-sorted in id-desc (which is what
    // Prisma would return given our orderBy). The route slices to 50;
    // the nextCursor lands on the 50th row in that order.
    const sameTs = new Date('2026-05-21T12:00:00.000Z');
    const rows = Array.from({ length: 51 }, (_, i) =>
      mkRow({ id: `evt_${String(i).padStart(2, '0')}`, createdAt: sameTs }),
    );
    rows.sort((a, b) => b.id.localeCompare(a.id)); // id-desc, the orderBy contract
    (prisma.userEvent.findMany as jest.Mock).mockResolvedValueOnce(rows);

    const res = await request(app).get('/api/admin/events');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(50);
    // 51 ids 'evt_00'…'evt_50' sorted desc → first 50 are 'evt_50'…'evt_01'.
    // Boundary lands on 'evt_01' as the last row of the slice.
    expect(res.body.nextCursor).toBe('evt_01');
    // Belt + suspenders: assert the orderBy contract is unchanged.
    expect((prisma.userEvent.findMany as jest.Mock).mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});
