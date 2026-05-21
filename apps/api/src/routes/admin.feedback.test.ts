// F1.2 of the feedback-channel workstream (docs/FEEDBACK_PLAN.md).
// Tests for GET + PATCH /api/admin/feedback. Mirrors admin.test.ts
// mock chain (testIsAdmin flag flipped per test for the requireAdmin
// gating cases).

jest.mock('dotenv/config', () => ({}));

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

let testIsAdmin = true;

jest.mock('@hoard/db', () => ({
  prisma: {
    feedback: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
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
  id: string; userId: string; message: string;
  viewport: string | null; ua: string | null;
  read: boolean; createdAt: Date;
  user: { id: string; email: string; name: string | null; steamId: string | null };
}> = {}) => ({
  id: 'fb_1',
  userId: 'usr_1',
  message: 'some note',
  viewport: '1440×900',
  ua: 'Mozilla/5.0',
  read: false,
  createdAt: new Date('2026-05-13T12:00:00.000Z'),
  user: {
    id: 'usr_1',
    email: 'gaetano@example.com',
    name: 'Gaetano',
    steamId: null,
  },
  ...overrides,
});

describe('requireAdmin gating on the feedback admin routes', () => {
  beforeEach(() => { testIsAdmin = false; });

  it('GET /api/admin/feedback → 404 { error: "Not found" } for non-admins', async () => {
    const res = await request(app).get('/api/admin/feedback');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
    expect(prisma.feedback.findMany).not.toHaveBeenCalled();
  });

  it('PATCH /api/admin/feedback/:id → 404 { error: "Not found" } for non-admins', async () => {
    const res = await request(app)
      .patch('/api/admin/feedback/fb_1')
      .send({ read: true });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
    expect(prisma.feedback.update).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/feedback — cursor pagination', () => {
  it('returns a nextCursor when there is more data; null when the page is the last one', async () => {
    // 51 rows → page yields 50 + the 51st triggers hasMore. The route
    // slices to 50 and emits the 50th's id as nextCursor.
    const rows = Array.from({ length: 51 }, (_, i) =>
      mkRow({ id: `fb_${i + 1}`, createdAt: new Date(2026, 4, 13, 12, 0, 0, i) }),
    );
    (prisma.feedback.findMany as jest.Mock).mockResolvedValueOnce(rows);
    (prisma.feedback.count as jest.Mock).mockResolvedValueOnce(7);

    const firstPage = await request(app).get('/api/admin/feedback');
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items).toHaveLength(50);
    expect(firstPage.body.nextCursor).toBe('fb_50');
    expect(firstPage.body.unreadCount).toBe(7);
    // The cursor query is verified by the orderBy + the structural shape;
    // confirm the ordering invariant is what the route asked for.
    expect((prisma.feedback.findMany as jest.Mock).mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);

    // Second page: only 30 rows returned → fewer than 51 → nextCursor null.
    (prisma.feedback.findMany as jest.Mock).mockResolvedValueOnce(rows.slice(0, 30));
    (prisma.feedback.count as jest.Mock).mockResolvedValueOnce(7);

    const secondPage = await request(app).get('/api/admin/feedback?cursor=fb_50');
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.nextCursor).toBeNull();
    // unreadCount stays accurate regardless of which page is being served.
    expect(secondPage.body.unreadCount).toBe(7);
  });
});

describe('PATCH /api/admin/feedback/:id', () => {
  it('updates the read flag and returns 200 + the joined row', async () => {
    (prisma.feedback.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'fb_1' });
    (prisma.feedback.update as jest.Mock).mockResolvedValueOnce(mkRow({ read: true }));

    const res = await request(app)
      .patch('/api/admin/feedback/fb_1')
      .send({ read: true });

    expect(res.status).toBe(200);
    expect(res.body.read).toBe(true);
    expect(res.body.user.displayIdentity).toBe('gaetano@example.com');
    expect(prisma.feedback.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'fb_1' },
        data: { read: true },
      }),
    );
  });

  it('returns 404 with the canonical body when the row is gone', async () => {
    (prisma.feedback.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch('/api/admin/feedback/missing')
      .send({ read: true });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
    expect(prisma.feedback.update).not.toHaveBeenCalled();
  });
});
