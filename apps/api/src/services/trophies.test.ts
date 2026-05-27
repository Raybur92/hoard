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
  game: { id: string; title: string; psnNpCommunicationId: string | null };
}

function makeUg(overrides: Partial<MockUserGame> & { gameId?: string; gameTitle?: string; npId?: string | null } = {}): MockUserGame {
  return {
    id: overrides.id ?? 'ug-1',
    userId: overrides.userId ?? 'user-1',
    gameId: overrides.gameId ?? 'game-1',
    status: overrides.status ?? 'Backlog',
    game: {
      id: overrides.gameId ?? 'game-1',
      title: overrides.gameTitle ?? 'Slay the Spire',
      psnNpCommunicationId: overrides.npId ?? null,
    },
  };
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
    expect(prisma.userGame.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ug-1' },
      data: expect.objectContaining({
        achievementsEarned: 48,
        achievementsTotal: 48,
        achievementsPercent: 100,
      }),
    }));
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
    // Same title but a different npId already locked in — title fallback
    // must not overwrite it. The trophy goes unmatched.
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
    // Behaviour change vs T-D2 baseline: under P-series, a Wishlist
    // UserGame that gets ANY earned-trophy evidence is promoted. At 100%
    // we fold the auto-complete in so the user doesn't transit via OnHold.
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', npId: 'NPWR12345_00', status: 'Wishlist' }),
    ]);

    const result = await applyPsnTrophyAggregates('user-1', [makeTrophy()]);

    expect(result.autoCompleted).toBe(1);
    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBe('Completed');
  });

  it('promotes Wishlist → OnHold at partial trophy progress (P-series — Andrea\'s Lego Batman case)', async () => {
    // Under T-D2 baseline this stayed Wishlist (applyAutoCompleteRule
    // returned null below 100%). Under P-series the promoteWishlistOnEngagement
    // path fires whenever earned > 0, flipping to OnHold.
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', npId: 'NPWR12345_00', status: 'Wishlist' }),
    ]);

    const result = await applyPsnTrophyAggregates('user-1', [
      makeTrophy({
        earned: { bronze: 14, silver: 2, gold: 0, platinum: 0 }, // 16/48 ≈ 33%
      }),
    ]);

    expect(result.matched).toBe(1);
    expect(result.autoCompleted).toBe(0); // not Completed, just OnHold
    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBe('OnHold');
    expect(data.achievementsEarned).toBe(16);
    expect(data.achievementsPercent).toBe(33);
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
    expect(data.status).toBeUndefined(); // status not in update body
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
    expect(data.achievementsPercent).toBe(63);
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
    expect(data.achievementsEarned).toBe(13);
    expect(data.achievementsTotal).toBe(29);
    expect(data.achievementsPercent).toBe(45); // round(13/29*100) = 45
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

    expect(result.matched).toBe(0); // skipped — no update
    expect(prisma.userGame.update).not.toHaveBeenCalled();
  });
});
