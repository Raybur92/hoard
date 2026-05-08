import { getSteamWishlist } from './steam';

beforeEach(() => {
  process.env['STEAM_API_KEY'] = 'test-key';
  global.fetch = jest.fn() as typeof global.fetch;
});

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function notOk(status = 400): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

describe('getSteamWishlist', () => {
  it('returns mapped items on a successful response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({
        response: {
          items: [
            { appid: 990080, priority: 0, date_added: 1736380800 }, // 2025-01-08
            { appid: 1850570, priority: 1, date_added: 1736467200 }, // 2025-01-09
          ],
        },
      }),
    );

    const out = await getSteamWishlist('STEAM_ID');
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      appid: 990080,
      priority: 0,
      addedAt: new Date(1736380800 * 1000),
    });
  });

  it('returns [] on a private profile (empty response)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok({ response: {} }));
    expect(await getSteamWishlist('STEAM_ID')).toEqual([]);
  });

  it('returns [] on a non-2xx HTTP response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(notOk(403));
    expect(await getSteamWishlist('STEAM_ID')).toEqual([]);
  });

  it('returns [] on a network failure (fetch throws)', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNRESET'));
    expect(await getSteamWishlist('STEAM_ID')).toEqual([]);
  });

  it('throws when STEAM_API_KEY is not set', async () => {
    delete process.env['STEAM_API_KEY'];
    await expect(getSteamWishlist('STEAM_ID')).rejects.toThrow(/STEAM_API_KEY/);
  });

  it('falls back to "now" when date_added is missing', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      ok({ response: { items: [{ appid: 1 }] } }),
    );
    const out = await getSteamWishlist('STEAM_ID');
    expect(out).toHaveLength(1);
    expect(out[0]?.addedAt).toBeInstanceOf(Date);
    expect(out[0]?.priority).toBe(0); // default when missing
  });
});
