import { getXboxPlaytimes } from './xboxPlaytime';

beforeEach(() => {
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
