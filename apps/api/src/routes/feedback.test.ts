// F1.2 of the feedback-channel workstream (docs/FEEDBACK_PLAN.md).
// Tests for POST /api/feedback. Auth chain (requireUser + requireActive)
// is mocked at the middleware-module level per the established pattern;
// Prisma is mocked at the module level per CLAUDE.md hard rule 7.

jest.mock('dotenv/config', () => ({}));

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

jest.mock('@hoard/db', () => ({
  prisma: {
    feedback: {
      create: jest.fn(),
    },
  },
}));

jest.mock('../middleware/user', () => ({
  requireUser: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { userId: string }).userId = 'user-1';
    next();
  },
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { userId: string }).userId = 'user-1';
    next();
  },
}));

jest.mock('../middleware/active', () => ({
  requireActive: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { id: string; status: 'ACTIVE'; isAdmin: boolean } }).user = {
      id: 'user-1', status: 'ACTIVE', isAdmin: false,
    };
    next();
  },
}));

import { app } from '../index';
import { prisma } from '@hoard/db';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('POST /api/feedback', () => {
  it('creates a Feedback row and returns 201 + { id }', async () => {
    (prisma.feedback.create as jest.Mock).mockResolvedValue({ id: 'fb_1' });

    const res = await request(app)
      .post('/api/feedback')
      .send({
        message: 'hero countdown feels frozen',
        viewport: '1440×900',
        ua: 'Mozilla/5.0',
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'fb_1' });
    expect(prisma.feedback.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        message: 'hero countdown feels frozen',
        viewport: '1440×900',
        ua: 'Mozilla/5.0',
      },
      select: { id: true },
    });
  });

  it('rejects empty messages and oversize messages with 400', async () => {
    const empty = await request(app).post('/api/feedback').send({ message: '' });
    expect(empty.status).toBe(400);
    expect(prisma.feedback.create).not.toHaveBeenCalled();

    const oversize = await request(app)
      .post('/api/feedback')
      .send({ message: 'x'.repeat(16001) });
    expect(oversize.status).toBe(400);
    expect(prisma.feedback.create).not.toHaveBeenCalled();
  });

  it('captures userId from the auth chain — body userId is ignored', async () => {
    (prisma.feedback.create as jest.Mock).mockResolvedValue({ id: 'fb_2' });

    const res = await request(app)
      .post('/api/feedback')
      .send({
        message: 'note',
        // Attempt to set a different userId via the body — should be ignored.
        userId: 'evil-attacker-id',
      } as Record<string, unknown>);

    expect(res.status).toBe(201);
    expect(prisma.feedback.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1' }),
      }),
    );
  });

  it('falls back to req.headers["user-agent"] when ua is omitted from the body', async () => {
    (prisma.feedback.create as jest.Mock).mockResolvedValue({ id: 'fb_3' });

    const res = await request(app)
      .post('/api/feedback')
      .set('User-Agent', 'TestBrowser/1.0')
      .send({ message: 'note', viewport: '375×667' });

    expect(res.status).toBe(201);
    expect(prisma.feedback.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ua: 'TestBrowser/1.0' }),
      }),
    );
  });
});
