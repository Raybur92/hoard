jest.mock('@hoard/db', () => ({
  prisma: {
    userGame: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import {
  getSteamAchievementsForGame,
  triggerSteamAchievementsBackground,
} from './steamAchievements';
import { prisma } from '@hoard/db';

beforeEach(() => {
  jest.resetAllMocks();
  process.env['STEAM_API_KEY'] = 'test-key';
  global.fetch = jest.fn() as typeof global.fetch;
});

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function notOk(status = 400, body: unknown = {}): Response {
  return { ok: false, status, json: async () => body } as unknown as Response;
}

/* ── getSteamAchievementsForGame ── */

describe('getSteamAchievementsForGame', () => {
  it('returns earned + total counts on a successful response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({
        playerstats: {
          success: true,
          achievements: [
            { apiname: 'A1', achieved: 1, unlocktime: 1700000000 },
            { apiname: 'A2', achieved: 0, unlocktime: 0 },
            { apiname: 'A3', achieved: 1, unlocktime: 1700000001 },
            { apiname: 'A4', achieved: 1, unlocktime: 1700000002 },
          ],
        },
      }),
    );

    const out = await getSteamAchievementsForGame('STEAM_ID', 12345);
    expect(out).toEqual({ earned: 3, total: 4 });
  });

  it('returns null when the profile is private', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ playerstats: { success: false, error: 'Profile is not public' } }),
    );
    expect(await getSteamAchievementsForGame('SID', 1)).toBeNull();
  });

  it('returns null when the game has no achievement support', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ playerstats: { success: false, error: 'Requested app has no stats' } }),
    );
    expect(await getSteamAchievementsForGame('SID', 1)).toBeNull();
  });

  it('returns null on HTTP non-2xx (Steam returns 400/403 on some unsupported apps)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notOk(400));
    expect(await getSteamAchievementsForGame('SID', 1)).toBeNull();
  });

  it('returns null on a network error (fetch throws)', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNRESET'));
    expect(await getSteamAchievementsForGame('SID', 1)).toBeNull();
  });

  it('returns null when achievements array is empty (no per-user data)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ playerstats: { success: true, achievements: [] } }),
    );
    expect(await getSteamAchievementsForGame('SID', 1)).toBeNull();
  });

  it('throws when STEAM_API_KEY is not set', async () => {
    delete process.env['STEAM_API_KEY'];
    await expect(getSteamAchievementsForGame('SID', 1)).rejects.toThrow(/STEAM_API_KEY/);
  });
});

/* ── triggerSteamAchievementsBackground ── */

interface MockUserGame {
  id: string;
  status: string;
  playtimeByPlatform: Record<string, number>;
  game: { id: string; title: string; steamAppId: number | null };
}

function makeUg(overrides: Partial<MockUserGame> & { steamAppId?: number | null; ptbp?: Record<string, number>; status?: string; title?: string } = {}): MockUserGame {
  return {
    id: overrides.id ?? 'ug-1',
    status: overrides.status ?? 'Backlog',
    playtimeByPlatform: overrides.ptbp ?? { ST: 600 },
    game: {
      id: 'game-1',
      title: overrides.title ?? 'Test Game',
      steamAppId: overrides.steamAppId === undefined ? 100 : overrides.steamAppId,
    },
  };
}

describe('triggerSteamAchievementsBackground — candidate filter', () => {
  it('skips games without a steamAppId', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-no-steam', steamAppId: null }),
    ]);

    const result = await triggerSteamAchievementsBackground('user-1', 'SID');
    expect(result.candidates).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('skips games with no Steam playtime entry (came from a different platform)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-psn-only', ptbp: { PS: 800 } }), // steamAppId set, but no ST playtime
    ]);

    const result = await triggerSteamAchievementsBackground('user-1', 'SID');
    expect(result.candidates).toBe(0);
  });

  it('processes only games that have BOTH steamAppId AND Steam playtime', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-ok', steamAppId: 100, ptbp: { ST: 600 } }),
      makeUg({ id: 'ug-no-steam', steamAppId: null, ptbp: { ST: 100 } }),
      makeUg({ id: 'ug-psn-only', steamAppId: 200, ptbp: { PS: 600 } }),
    ]);
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ playerstats: { success: true, achievements: [{ apiname: 'A', achieved: 1 }] } }),
    );

    const result = await triggerSteamAchievementsBackground('user-1', 'SID');
    expect(result.candidates).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('includes Wishlist UserGames that have a steamAppId but no ST playtime (P-series CM13 driver)', async () => {
    // Closes the gap where Steam achievements pop before Steam playtime
    // increments. The Wishlist row has steamAppId from Steam wishlist
    // import; achievements drive the CM13 promotion via P-series.
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-wishlist', steamAppId: 300, status: 'Wishlist', ptbp: {} }),
    ]);
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ playerstats: { success: true, achievements: [{ apiname: 'A', achieved: 1 }] } }),
    );

    const result = await triggerSteamAchievementsBackground('user-1', 'SID');
    expect(result.candidates).toBe(1);
  });
});

describe('triggerSteamAchievementsBackground — write + auto-complete', () => {
  it('writes earned/total/percent and flips Backlog → Completed at 100%', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', status: 'Backlog' }),
    ]);
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({
        playerstats: {
          success: true,
          achievements: [
            { apiname: 'A1', achieved: 1 },
            { apiname: 'A2', achieved: 1 },
            { apiname: 'A3', achieved: 1 },
          ],
        },
      }),
    );

    const result = await triggerSteamAchievementsBackground('user-1', 'SID');
    expect(result.fetched).toBe(1);
    expect(result.autoCompleted).toBe(1);

    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.achievementsEarned).toBe(3);
    expect(data.achievementsTotal).toBe(3);
    expect(data.achievementsPercent).toBe(100);
    expect(data.status).toBe('Completed');
  });

  it('promotes Wishlist → OnHold at partial achievement progress (P-series)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-wl', steamAppId: 200, status: 'Wishlist', ptbp: {} }),
    ]);
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({
        playerstats: {
          success: true,
          achievements: [
            { apiname: 'A1', achieved: 1 },
            { apiname: 'A2', achieved: 0 },
            { apiname: 'A3', achieved: 0 },
          ],
        },
      }),
    );

    const result = await triggerSteamAchievementsBackground('user-1', 'SID');
    expect(result.fetched).toBe(1);
    expect(result.autoCompleted).toBe(0); // not Completed, just OnHold
    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBe('OnHold');
    expect(data.achievementsPercent).toBe(33);
  });

  it('promotes Wishlist → Completed at 100% (P-series folds in T-D2)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-wl', steamAppId: 200, status: 'Wishlist', ptbp: {} }),
    ]);
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({
        playerstats: {
          success: true,
          achievements: [
            { apiname: 'A1', achieved: 1 },
            { apiname: 'A2', achieved: 1 },
          ],
        },
      }),
    );

    const result = await triggerSteamAchievementsBackground('user-1', 'SID');
    expect(result.autoCompleted).toBe(1);
    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBe('Completed');
  });

  it('P-FIX-2: backfills playtimeByPlatform.ST = 0 when achievements land on a UserGame with no ST entry', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-wl', steamAppId: 200, status: 'Wishlist', ptbp: {} }),
    ]);
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ playerstats: { success: true, achievements: [{ apiname: 'A', achieved: 1 }] } }),
    );

    await triggerSteamAchievementsBackground('user-1', 'SID');
    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.playtimeByPlatform).toEqual({ ST: 0 });
  });

  it('P-FIX-2: preserves existing ST playtime when backfilling (doesn\'t clobber syncSteamLibrary minutes)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', steamAppId: 100, status: 'Playing', ptbp: { ST: 7200 } }),
    ]);
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ playerstats: { success: true, achievements: [{ apiname: 'A', achieved: 1 }] } }),
    );

    await triggerSteamAchievementsBackground('user-1', 'SID');
    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    // ST already in ptbp — don't rewrite playtimeByPlatform at all.
    expect(data.playtimeByPlatform).toBeUndefined();
  });

  it('preserves Dropped at 100% (T-D2 user-decision rule)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', status: 'Dropped' }),
    ]);
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ playerstats: { success: true, achievements: [{ apiname: 'A', achieved: 1 }] } }),
    );

    const result = await triggerSteamAchievementsBackground('user-1', 'SID');
    expect(result.autoCompleted).toBe(0);
    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
  });

  it('counts a skip when the fetcher returns null (private profile / no achievements / HTTP error)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1' }),
    ]);
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ playerstats: { success: false, error: 'Profile is not public' } }),
    );

    const result = await triggerSteamAchievementsBackground('user-1', 'SID');
    expect(result.skipped).toBe(1);
    expect(result.fetched).toBe(0);
    expect(prisma.userGame.update).not.toHaveBeenCalled();
  });

  it('a per-game error increments errors and continues to the next game', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUg({ id: 'ug-1', title: 'a' }),
      makeUg({ id: 'ug-2', title: 'b' }),
    ]);
    (prisma.userGame.update as jest.Mock).mockResolvedValueOnce({}).mockResolvedValueOnce({});
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(ok({ playerstats: { success: true, achievements: [{ apiname: 'A', achieved: 1 }] } }));

    // The fetcher swallows fetch errors and returns null — so this case is
    // actually a "skip" rather than an "error" at the orchestrator level.
    // To trigger the orchestrator's error path we'd need the prisma.update
    // call itself to throw. Verify that scenario:
    (prisma.userGame.update as jest.Mock)
      .mockReset()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({});
    (global.fetch as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce(ok({ playerstats: { success: true, achievements: [{ apiname: 'A', achieved: 1 }] } }))
      .mockResolvedValueOnce(ok({ playerstats: { success: true, achievements: [{ apiname: 'A', achieved: 1 }] } }));

    const result = await triggerSteamAchievementsBackground('user-1', 'SID');
    expect(result.errors).toBe(1);
    expect(result.fetched).toBe(1); // the one that succeeded
  });
});
