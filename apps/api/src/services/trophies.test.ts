jest.mock('@hoard/db', () => ({
  prisma: {
    userGame: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    game: {
      update: jest.fn(),
    },
  },
}));

import { applyPsnTrophyAggregates, __testing } from './trophies';
import type { PsnTrophyTitle } from './platforms/psn';
import { prisma } from '@hoard/db';
import { Prisma } from '@prisma/client';

const { normalize } = __testing;

function makeTrophy(overrides: Partial<PsnTrophyTitle> = {}): PsnTrophyTitle {
  return {
    npCommunicationId: 'NPWR12345_00',
    cleanedTitle: 'Slay the Spire',
    defined: { bronze: 36, silver: 7, gold: 4, platinum: 1 },  // total 48
    earned:  { bronze: 36, silver: 7, gold: 4, platinum: 1 },  // total 48 → 100%
    progress: 100,
    lastUpdatedAt: new Date('2026-05-08T00:00:00.000Z'),
    ...overrides,
  };
}

interface MockUserGame {
  id: string;
  userId: string;
  gameId: string;
  status: string;
  achievementsByPlatform: Record<string, unknown>;
  playtimeByPlatform?: Record<string, number>;
  game: { id: string; title: string; psnNpCommunicationId: string | null };
}

function makeUg(overrides: Partial<MockUserGame> & { gameId?: string; gameTitle?: string; npId?: string | null } = {}): MockUserGame {
  const ug: MockUserGame = {
    id: overrides.id ?? 'ug-1',
    userId: overrides.userId ?? 'user-1',
    gameId: overrides.gameId ?? 'game-1',
    status: overrides.status ?? 'Backlog',
    achievementsByPlatform: overrides.achievementsByPlatform ?? {},
    game: {
      id: overrides.gameId ?? 'game-1',
      title: overrides.gameTitle ?? 'Slay the Spire',
      psnNpCommunicationId: overrides.npId ?? null,
    },
  };
  if (overrides.playtimeByPlatform) ug.playtimeByPlatform = overrides.playtimeByPlatform;
  return ug;
}

beforeEach(() => {
  jest.resetAllMocks();
});

/* ── normalize ── */

describe('normalize', () => {
  it('lowercases + collapses punctuation', () => {
    expect(normalize('Slay the Spire®')).toBe('slay the spire');
    expect(normalize('FAR CRY 6')).toBe('far cry 6');
  });
  it('strips diacritics', () => {
    expect(normalize('God of War Ragnarök')).toBe('god of war ragnarok');
  });
});

/* ── applyPsnTrophyAggregates ── */

describe('applyPsnTrophyAggregates — matching strategy (T-D5)', () => {
  it('matches by Game.psnNpCommunicationId when set (stable path)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', npId: 'NPWR12345_00', gameTitle: 'Different Title — But the npId matches' }),
    ]);

    const result = await applyPsnTrophyAggregates('user-1', [makeTrophy()]);

    expect(result.matched).toBe(1);
    expect(result.missed).toBe(0);
    expect(prisma.game.update).not.toHaveBeenCalled(); // npId already set, no persistence needed

    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.achievementsByPlatform.PS).toEqual({
      earned: 48,
      total: 48,
      percent: 100,
      updatedAt: expect.any(String),
    });
  });

  it('falls back to normalized-title match when npId is null, and persists the npId', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', gameId: 'game-x', gameTitle: 'SLAY THE SPIRE', npId: null }),
    ]);

    const result = await applyPsnTrophyAggregates('user-1', [makeTrophy()]);

    expect(result.matched).toBe(1);
    expect(prisma.game.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'game-x' },
      data: { psnNpCommunicationId: 'NPWR12345_00' },
    }));
    expect(prisma.userGame.update).toHaveBeenCalled();
  });

  it('does NOT title-match a Game that already has a different npId set', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', npId: 'NPWR_OTHER_00', gameTitle: 'Slay the Spire' }),
    ]);

    const result = await applyPsnTrophyAggregates('user-1', [makeTrophy()]);

    expect(result.matched).toBe(0);
    expect(result.missed).toBe(1);
    expect(prisma.game.update).not.toHaveBeenCalled();
    expect(prisma.userGame.update).not.toHaveBeenCalled();
  });

  it('counts a miss when neither npId nor title matches', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ gameTitle: 'Wildly Different Game' }),
    ]);

    const result = await applyPsnTrophyAggregates('user-1', [makeTrophy()]);

    expect(result.matched).toBe(0);
    expect(result.missed).toBe(1);
  });
});

describe('applyPsnTrophyAggregates — auto-complete (T-D2)', () => {
  it('flips Backlog → Completed at 100%', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', npId: 'NPWR12345_00', status: 'Backlog' }),
    ]);

    const result = await applyPsnTrophyAggregates('user-1', [makeTrophy()]);

    expect(result.autoCompleted).toBe(1);
    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBe('Completed');
  });

  it('preserves Dropped at 100%', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', npId: 'NPWR12345_00', status: 'Dropped' }),
    ]);

    const result = await applyPsnTrophyAggregates('user-1', [makeTrophy()]);

    expect(result.autoCompleted).toBe(0);
    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBeUndefined(); // not present in update body
  });

  it('promotes Wishlist → Completed at 100% (P-series — folds in CM13 + T-D2)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', npId: 'NPWR12345_00', status: 'Wishlist' }),
    ]);

    const result = await applyPsnTrophyAggregates('user-1', [makeTrophy()]);

    expect(result.autoCompleted).toBe(1);
    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBe('Completed');
  });

  it('promotes Wishlist → OnHold at partial trophy progress (P-series — Andrea\'s Lego Batman case)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', npId: 'NPWR12345_00', status: 'Wishlist' }),
    ]);

    const result = await applyPsnTrophyAggregates('user-1', [
      makeTrophy({
        earned: { bronze: 14, silver: 2, gold: 0, platinum: 0 }, // 16/48 ≈ 33%
      }),
    ]);

    expect(result.matched).toBe(1);
    expect(result.autoCompleted).toBe(0);
    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBe('OnHold');
    expect(data.achievementsByPlatform.PS.earned).toBe(16);
    expect(data.achievementsByPlatform.PS.percent).toBe(33);
  });

  it('preserves Wishlist when no trophies earned yet (no engagement signal)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', npId: 'NPWR12345_00', status: 'Wishlist' }),
    ]);

    const result = await applyPsnTrophyAggregates('user-1', [
      makeTrophy({
        earned: { bronze: 0, silver: 0, gold: 0, platinum: 0 }, // 0/48
      }),
    ]);

    expect(result.matched).toBe(1);
    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
  });

  it('does NOT auto-complete below 100% even on auto-complete-eligible status', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', npId: 'NPWR12345_00', status: 'Playing' }),
    ]);

    const result = await applyPsnTrophyAggregates('user-1', [
      makeTrophy({
        earned: { bronze: 30, silver: 0, gold: 0, platinum: 0 }, // 30/48 ≈ 63%
      }),
    ]);

    expect(result.autoCompleted).toBe(0);
    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.achievementsByPlatform.PS.percent).toBe(63);
    expect(data.status).toBeUndefined();
  });
});

describe('applyPsnTrophyAggregates — aggregate math', () => {
  it('persists earned/total/percent computed from the four trophy types', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', npId: 'NPWR12345_00' }),
    ]);

    await applyPsnTrophyAggregates('user-1', [
      makeTrophy({
        defined: { bronze: 20, silver: 5, gold: 3, platinum: 1 }, // 29 total
        earned:  { bronze: 10, silver: 2, gold: 1, platinum: 0 }, // 13 earned
      }),
    ]);

    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.achievementsByPlatform.PS).toEqual({
      earned: 13,
      total: 29,
      percent: 45, // round(13/29*100) = 45
      updatedAt: expect.any(String),
    });
  });

  it('skips defensively when defined trophies sum to 0', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', npId: 'NPWR12345_00' }),
    ]);

    const result = await applyPsnTrophyAggregates('user-1', [
      makeTrophy({
        defined: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
        earned:  { bronze: 0, silver: 0, gold: 0, platinum: 0 },
      }),
    ]);

    expect(result.matched).toBe(0);
    expect(prisma.userGame.update).not.toHaveBeenCalled();
  });
});

describe('applyPsnTrophyAggregates — M0 per-platform merge', () => {
  it('preserves existing .ST entry when writing .PS (no clobber across platforms)', async () => {
    // Cross-platform game where Steam achievement sync already wrote .ST.
    // PSN trophy sync now writes .PS — must merge, not replace.
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({
        id: 'ug-1',
        npId: 'NPWR12345_00',
        achievementsByPlatform: {
          ST: { earned: 28, total: 44, percent: 64, updatedAt: '2026-05-20T00:00:00.000Z' },
        },
      }),
    ]);

    await applyPsnTrophyAggregates('user-1', [makeTrophy()]);

    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    // .ST preserved verbatim
    expect(data.achievementsByPlatform.ST).toEqual({
      earned: 28, total: 44, percent: 64, updatedAt: '2026-05-20T00:00:00.000Z',
    });
    // .PS added with new values
    expect(data.achievementsByPlatform.PS).toEqual({
      earned: 48, total: 48, percent: 100, updatedAt: expect.any(String),
    });
  });

  it('overwrites existing .PS entry on PSN re-sync (no stale data accumulation)', async () => {
    // PSN re-sync after the user has popped more trophies. The old .PS
    // entry should be replaced, not merged (single-platform-write per
    // sync is fine — there's no second PSN somewhere).
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({
        id: 'ug-1',
        npId: 'NPWR12345_00',
        achievementsByPlatform: {
          PS: { earned: 10, total: 48, percent: 21, updatedAt: '2026-04-01T00:00:00.000Z' },
        },
      }),
    ]);

    await applyPsnTrophyAggregates('user-1', [makeTrophy()]);

    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.achievementsByPlatform.PS).toEqual({
      earned: 48, total: 48, percent: 100, updatedAt: expect.any(String),
    });
  });
});

describe('applyPsnTrophyAggregates — P-FIX-1 + P-FIX-2', () => {
  it('catches P2002 on Game.update and continues with the trophy data write (cross-region npId collision)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-a', gameId: 'game-a', gameTitle: 'Slay the Spire' }),
      makeUg({ id: 'ug-b', gameId: 'game-b', gameTitle: 'Slay the Spire EU' }),
    ]);
    (prisma.game.update as jest.Mock)
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.0.0',
          meta: { modelName: 'Game', target: ['psnNpCommunicationId'] },
        }),
      );

    const result = await applyPsnTrophyAggregates('user-1', [
      makeTrophy({ npCommunicationId: 'NPWR_SAME_00', cleanedTitle: 'Slay the Spire' }),
      makeTrophy({ npCommunicationId: 'NPWR_SAME_00', cleanedTitle: 'Slay the Spire EU' }),
    ]);

    expect(prisma.userGame.update).toHaveBeenCalledTimes(2);
    expect(result.matched).toBe(2);
  });

  it('re-throws non-P2002 errors on Game.update (preserves error visibility for other failures)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1' }),
    ]);
    (prisma.game.update as jest.Mock).mockRejectedValue(new Error('DB connection lost'));

    await expect(applyPsnTrophyAggregates('user-1', [makeTrophy()])).rejects.toThrow(/DB connection lost/);
  });

  it('backfills playtimeByPlatform.PS = 0 when a trophy match lands on a UserGame with no PS entry yet', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', npId: 'NPWR12345_00' }),
    ]);

    await applyPsnTrophyAggregates('user-1', [makeTrophy()]);

    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.playtimeByPlatform).toEqual({ PS: 0 });
  });

  it('preserves existing PS playtime when backfilling (doesn\'t clobber syncPsnLibrary\'s real minutes)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({
        id: 'ug-1',
        npId: 'NPWR12345_00',
        playtimeByPlatform: { PS: 4200, ST: 100 },
      }),
    ]);

    await applyPsnTrophyAggregates('user-1', [makeTrophy()]);

    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.playtimeByPlatform).toBeUndefined();
  });
});
