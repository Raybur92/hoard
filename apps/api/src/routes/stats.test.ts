import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

jest.mock('@hoard/db', () => ({
  prisma: {
    userGame: { findMany: jest.fn() },
  },
}));

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

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/stats', () => {
  it('aggregates totals, playtime by platform, genre breakdown, and shelf counts', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'ug-1', status: 'Completed',
        playtimeByPlatform: { ST: 600, PS: 200 } as Record<string, number>,
        game: { genres: ['RPG', 'Action'] },
      },
      {
        id: 'ug-2', status: 'OnHold',
        playtimeByPlatform: { ST: 100 } as Record<string, number>,
        game: { genres: ['RPG'] },
      },
      {
        id: 'ug-3', status: 'Playing',
        playtimeByPlatform: { PS: 400 } as Record<string, number>,
        game: { genres: ['Strategy'] },
      },
    ]);

    const res = await request(app).get('/api/stats');

    expect(res.status).toBe(200);
    expect(res.body.totalGames).toBe(3);
    expect(res.body.completedGames).toBe(1);
    expect(res.body.completionPct).toBeCloseTo(33.3, 1);
    expect(res.body.totalPlaytimeMinutes).toBe(1300); // 600+200+100+400

    expect(res.body.playtimeByPlatform).toHaveLength(2);
    // sorted descending — Steam (700) before PSN (600)
    expect(res.body.playtimeByPlatform[0].code).toBe('ST');
    expect(res.body.playtimeByPlatform[0].minutes).toBe(700);
    expect(res.body.playtimeByPlatform[0].label).toBe('STEAM');

    // genres sorted desc — RPG appears in 2 games
    expect(res.body.genreBreakdown[0]).toEqual({ name: 'RPG', count: 2 });

    // shelfCounts remaps OnHold → "On Hold"
    expect(res.body.shelfCounts['On Hold']).toBe(1);
    expect(res.body.shelfCounts.Completed).toBe(1);
    expect(res.body.shelfCounts.Playing).toBe(1);
  });

  it('returns zeroed totals for an empty library', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app).get('/api/stats');

    expect(res.status).toBe(200);
    expect(res.body.totalGames).toBe(0);
    expect(res.body.completionPct).toBe(0);
    expect(res.body.totalPlaytimeMinutes).toBe(0);
    expect(res.body.playtimeByPlatform).toEqual([]);
    expect(res.body.genreBreakdown).toEqual([]);
  });
});
