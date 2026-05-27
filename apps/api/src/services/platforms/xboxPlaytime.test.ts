jest.mock('@hoard/db', () => ({
  prisma: {
    userGame: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { getXboxPlaytimes, applyXboxPlaytimeBackground } from './xboxPlaytime';
import { prisma } from '@hoard/db';

beforeEach(() => {
  jest.resetAllMocks();
  global.fetch = jest.fn() as typeof global.fetch;
});

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function notOk(status = 500): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

/** Helper — build the live OpenXBL response envelope from a stat list. */
function makeOkResponse(stats: Array<{ titleid: string; value: string }>): unknown {
  return {
    content: {
      groups: [],
      statlistscollection: [{
        arrangebyfield: 'xuid',
        arrangebyfieldid: '2535463549504134',
        stats: stats.map((s) => ({
          xuid: '2535463549504134',
          scid: '00000000-0000-0000-0000-00007900c3c7',
          titleid: s.titleid,
          name: 'MinutesPlayed',
          type: 'Integer',
          value: s.value,
          properties: {},
        })),
      }],
    },
    code: 200,
  };
}

describe('getXboxPlaytimes', () => {
  it('returns a Map<titleId, minutes> from a batched POST response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok(makeOkResponse([
        { titleid: '2030093255', value: '10219' },  // Forza Horizon 5 — 170 hours
        { titleid: '1634930870', value: '347' },    // REMATCH — 5.8 hours
      ])),
    );

    const out = await getXboxPlaytimes(
      { apiKey: 'fake-key' },
      '2535463549504134',
      [2030093255, 1634930870],
    );

    expect(out.size).toBe(2);
    expect(out.get(2030093255)).toBe(10219);
    expect(out.get(1634930870)).toBe(347);
  });

  it('returns an empty Map when no titleIds are passed (no fetch, no API call)', async () => {
    const out = await getXboxPlaytimes({ apiKey: 'fake-key' }, '2535463549504134', []);
    expect(out.size).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('passes the API key + correct headers + batched body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok(makeOkResponse([])));
    await getXboxPlaytimes({ apiKey: 'my-secret-key' }, 'XUID-1', [11, 22, 33]);

    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[0]).toBe('https://xbl.io/api/v2/player/stats');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(
      expect.objectContaining({
        'X-Authorization': 'my-secret-key',
        'Content-Type': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      }),
    );
    // Body batches all titleIds in one stats array, named "MinutesPlayed".
    const body = JSON.parse(init.body as string) as {
      xuids: string[];
      stats: Array<{ name: string; titleId: string }>;
    };
    expect(body.xuids).toEqual(['XUID-1']);
    expect(body.stats).toHaveLength(3);
    expect(body.stats[0]).toEqual({ name: 'MinutesPlayed', titleId: '11' });
    expect(body.stats[2]).toEqual({ name: 'MinutesPlayed', titleId: '33' });
  });

  it('parses string values (OpenXBL returns the integer as a string) into Int', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok(makeOkResponse([{ titleid: '100', value: '0' }, { titleid: '200', value: '1' }])),
    );
    const out = await getXboxPlaytimes({ apiKey: 'k' }, 'X', [100, 200]);
    expect(out.get(100)).toBe(0);  // zero playtime is a valid response (game owned but never played)
    expect(out.get(200)).toBe(1);
  });

  it('omits titles whose stat is not in the response (caller handles absence)', async () => {
    // Asked about 3 titles; OpenXBL only returns stat for the first.
    (global.fetch as jest.Mock).mockResolvedValue(
      ok(makeOkResponse([{ titleid: '100', value: '60' }])),
    );
    const out = await getXboxPlaytimes({ apiKey: 'k' }, 'X', [100, 200, 300]);
    expect(out.size).toBe(1);
    expect(out.get(100)).toBe(60);
    expect(out.has(200)).toBe(false);
    expect(out.has(300)).toBe(false);
  });

  it('drops stats with non-integer / negative / zero titleid (defensive)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({
        content: {
          statlistscollection: [{
            stats: [
              { titleid: 'not-a-number', name: 'MinutesPlayed', value: '500' },
              { titleid: '0', name: 'MinutesPlayed', value: '500' },
              { titleid: '-1', name: 'MinutesPlayed', value: '500' },
              { titleid: '100', name: 'MinutesPlayed', value: '500' }, // valid
            ],
          }],
        },
        code: 200,
      }),
    );
    const out = await getXboxPlaytimes({ apiKey: 'k' }, 'X', [100]);
    expect(out.size).toBe(1);
    expect(out.get(100)).toBe(500);
  });

  it('drops stats whose `name` is not MinutesPlayed', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({
        content: {
          statlistscollection: [{
            stats: [
              { titleid: '100', name: 'TotalAchievements', value: '50' }, // wrong stat
              { titleid: '200', name: 'MinutesPlayed', value: '120' },   // right stat
            ],
          }],
        },
        code: 200,
      }),
    );
    const out = await getXboxPlaytimes({ apiKey: 'k' }, 'X', [100, 200]);
    expect(out.size).toBe(1);
    expect(out.get(200)).toBe(120);
    expect(out.has(100)).toBe(false);
  });

  it('drops stats with negative MinutesPlayed values (defensive)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok(makeOkResponse([{ titleid: '100', value: '-5' }])),
    );
    const out = await getXboxPlaytimes({ apiKey: 'k' }, 'X', [100]);
    expect(out.size).toBe(0);
  });

  it('throws when OpenXBL returns its HTTP-200-but-app-level-error envelope', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ code: 400, content: '["bad request"]' }),
    );
    await expect(getXboxPlaytimes({ apiKey: 'k' }, 'X', [100])).rejects.toThrow(/app-level error code=400/);
  });

  it('throws when the API key is missing', async () => {
    await expect(getXboxPlaytimes({ apiKey: '' }, 'X', [100])).rejects.toThrow(/api key missing/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws when xuid is missing', async () => {
    await expect(getXboxPlaytimes({ apiKey: 'k' }, '', [100])).rejects.toThrow(/xuid missing/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws on a non-2xx HTTP response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notOk(401));
    await expect(getXboxPlaytimes({ apiKey: 'k' }, 'X', [100])).rejects.toThrow(/401/);
  });

  it('throws on a network error (fetch rejects)', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNRESET'));
    await expect(getXboxPlaytimes({ apiKey: 'k' }, 'X', [100])).rejects.toThrow(/network error/i);
  });

  it('throws on malformed JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true, status: 200,
      json: async () => { throw new Error('Unexpected token'); },
    } as unknown as Response);
    await expect(getXboxPlaytimes({ apiKey: 'k' }, 'X', [100])).rejects.toThrow(/malformed/i);
  });

  it('throws when the response lacks the content wrapper', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({ statlistscollection: [] }));
    await expect(getXboxPlaytimes({ apiKey: 'k' }, 'X', [100])).rejects.toThrow(/unexpected response shape/);
  });

  it('returns an empty Map when content.statlistscollection is empty', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({ content: { statlistscollection: [] }, code: 200 }));
    const out = await getXboxPlaytimes({ apiKey: 'k' }, 'X', [100]);
    expect(out.size).toBe(0);
  });
});

/* ── applyXboxPlaytimeBackground (orchestrator) ── */

/** Helper — minimal mocked /account response shape (wrapped under content). */
const ACCOUNT_OK = ok({
  content: {
    profileUsers: [{ id: '2535463549504134' }],
  },
});

/** Helper — build a mocked UserGame row with the prisma select shape. */
function ug(
  id: string,
  xboxTitleId: number | null,
  existingPlaytime: Record<string, number> = {},
  status: string = 'Backlog',
) {
  return {
    id,
    playtimeByPlatform: existingPlaytime,
    status,
    game: { xboxTitleId },
  };
}

describe('applyXboxPlaytimeBackground', () => {
  it('discovers xuid, fetches batched playtimes, writes minutes into playtimeByPlatform.XB', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      ug('ug-1', 2030093255),
      ug('ug-2', 1634930870),
    ]);
    // 1st fetch: /account (xuid discovery). 2nd: /v2/player/stats.
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(ACCOUNT_OK)
      .mockResolvedValueOnce(ok(makeOkResponse([
        { titleid: '2030093255', value: '10219' },
        { titleid: '1634930870', value: '347' },
      ])));

    const result = await applyXboxPlaytimeBackground('user-1', { apiKey: 'k' });

    expect(result).toEqual({ updated: 2, missing: 0 });
    expect(prisma.userGame.update).toHaveBeenCalledTimes(2);
    // Each update sets ONLY the XB slot — other slots would be preserved.
    expect(prisma.userGame.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ug-1' },
        data: { playtimeByPlatform: { XB: 10219 } },
      }),
    );
    expect(prisma.userGame.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ug-2' },
        data: { playtimeByPlatform: { XB: 347 } },
      }),
    );
  });

  it('preserves existing playtimes on other platforms when updating XB', async () => {
    // UserGame already has ST + PS playtime from prior syncs.
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      ug('ug-multi', 100, { ST: 5000, PS: 1200 }),
    ]);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(ACCOUNT_OK)
      .mockResolvedValueOnce(ok(makeOkResponse([{ titleid: '100', value: '600' }])));

    await applyXboxPlaytimeBackground('user-1', { apiKey: 'k' });

    expect(prisma.userGame.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { playtimeByPlatform: { ST: 5000, PS: 1200, XB: 600 } },
      }),
    );
  });

  it('counts UserGames OpenXBL did NOT return a stat for as "missing"', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      ug('ug-1', 100),
      ug('ug-2', 200),
      ug('ug-3', 300),
    ]);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(ACCOUNT_OK)
      .mockResolvedValueOnce(ok(makeOkResponse([
        { titleid: '100', value: '600' },
        // 200 + 300 omitted — OpenXBL doesn't have MinutesPlayed for them
      ])));

    const result = await applyXboxPlaytimeBackground('user-1', { apiKey: 'k' });

    expect(result).toEqual({ updated: 1, missing: 2 });
    expect(prisma.userGame.update).toHaveBeenCalledTimes(1);
  });

  it('returns {updated: 0, missing: 0} when no Xbox UserGames exist (empty library)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([]);
    // /account still fires before findMany returns 0; but stats call should NOT.
    (global.fetch as jest.Mock).mockResolvedValueOnce(ACCOUNT_OK);

    const result = await applyXboxPlaytimeBackground('user-1', { apiKey: 'k' });

    expect(result).toEqual({ updated: 0, missing: 0 });
    expect(prisma.userGame.update).not.toHaveBeenCalled();
    // Only the xuid discovery call fired (1 fetch total).
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws when xuid cannot be discovered from /account (caller logs + degrades)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(notOk(401));

    await expect(applyXboxPlaytimeBackground('user-1', { apiKey: 'k' })).rejects.toThrow(/could not discover xuid/i);
    expect(prisma.userGame.findMany).not.toHaveBeenCalled();
  });

  it('throws when the API key is missing', async () => {
    await expect(applyXboxPlaytimeBackground('user-1', { apiKey: '' })).rejects.toThrow(/api key missing/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('promotes Wishlist → OnHold when the side-pass surfaces playtime > 0 (P-series)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      ug('ug-wl', 100, {}, 'Wishlist'),
    ]);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(ACCOUNT_OK)
      .mockResolvedValueOnce(ok(makeOkResponse([{ titleid: '100', value: '47' }])));

    await applyXboxPlaytimeBackground('user-1', { apiKey: 'k' });

    expect(prisma.userGame.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ug-wl' },
        data: { playtimeByPlatform: { XB: 47 }, status: 'OnHold' },
      }),
    );
  });

  it('keeps Wishlist as-is when the side-pass returns 0 minutes (no engagement evidence)', async () => {
    // Edge case: title appears in the stats response but with value=0.
    // promoteWishlistOnOwnership returns undefined for total=0, so status
    // stays Wishlist. The data payload doesn't include status at all.
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      ug('ug-wl', 100, {}, 'Wishlist'),
    ]);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(ACCOUNT_OK)
      .mockResolvedValueOnce(ok(makeOkResponse([{ titleid: '100', value: '0' }])));

    await applyXboxPlaytimeBackground('user-1', { apiKey: 'k' });

    // Wait — promoteWishlistOnOwnership returns 'Backlog' for total === 0,
    // not undefined. That's the per-helper contract: Wishlist + 0 playtime
    // = "ownership without engagement" → Backlog. The Xbox side-pass
    // running with value=0 is the same shape: we DO want to promote out
    // of Wishlist (the user owns the game per Xbox library import) but
    // there's no playtime evidence yet.
    expect(prisma.userGame.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ug-wl' },
        data: { playtimeByPlatform: { XB: 0 }, status: 'Backlog' },
      }),
    );
  });

  it('does not change status for non-Wishlist UserGames (preserves user library state)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      ug('ug-1', 100, { XB: 0 }, 'OnHold'),
      ug('ug-2', 200, {}, 'Backlog'),
      ug('ug-3', 300, {}, 'Dropped'),
    ]);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(ACCOUNT_OK)
      .mockResolvedValueOnce(ok(makeOkResponse([
        { titleid: '100', value: '500' },
        { titleid: '200', value: '0' },
        { titleid: '300', value: '1200' },
      ])));

    await applyXboxPlaytimeBackground('user-1', { apiKey: 'k' });

    // status not in the update data for non-Wishlist rows
    const updateCalls = (prisma.userGame.update as jest.Mock).mock.calls;
    for (const call of updateCalls) {
      expect(call[0].data.status).toBeUndefined();
    }
  });
});
