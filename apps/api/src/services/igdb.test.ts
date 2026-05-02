import { searchGames, getGame, getUpcomingReleases, clearCaches } from './igdb';

// Mock environment variables
process.env['TWITCH_CLIENT_ID'] = 'test-client-id';
process.env['TWITCH_CLIENT_SECRET'] = 'test-client-secret';

const mockToken = { access_token: 'mock-token', expires_in: 3600 };

const mockIgdbGame = {
  id: 101,
  name: 'Hollow Knight',
  first_release_date: 1487635200, // 2017-02-21
  cover: { url: '//images.igdb.com/igdb/image/upload/t_thumb/abc123.jpg' },
  genres: [{ name: 'Platform' }, { name: 'Adventure' }],
  involved_companies: [{ company: { name: 'Team Cherry' }, developer: true }],
};

beforeEach(() => {
  clearCaches();
  global.fetch = jest.fn() as typeof global.fetch;
});

function mockTwitchAndIgdb(igdbGames: object[]) {
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce({ ok: true, json: async () => mockToken })
    .mockResolvedValueOnce({ ok: true, json: async () => igdbGames });
}

describe('searchGames', () => {
  it('returns mapped results from IGDB', async () => {
    mockTwitchAndIgdb([mockIgdbGame]);

    const results = await searchGames('Hollow Knight');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      igdbId: 101,
      title: 'Hollow Knight',
      developer: 'Team Cherry',
      releaseYear: 2017,
      genres: ['Platform', 'Adventure'],
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc123.jpg',
    });
  });

  it('returns empty array when IGDB returns no results', async () => {
    mockTwitchAndIgdb([]);
    const results = await searchGames('xyzzy-nonexistent');
    expect(results).toHaveLength(0);
  });

  it('caches results — second call does not fire a new HTTP request', async () => {
    mockTwitchAndIgdb([mockIgdbGame]);

    await searchGames('hollow knight');
    await searchGames('hollow knight'); // should hit cache

    // fetch called twice: once for token, once for IGDB — NOT a third time for the cached call
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('normalises cover URL from t_thumb to t_cover_big with https', async () => {
    mockTwitchAndIgdb([mockIgdbGame]);
    const [result] = await searchGames('test');
    expect(result?.coverUrl).toMatch(/^https:\/\/.*\/t_cover_big\//);
  });

  it('handles a game with no cover gracefully', async () => {
    const nocover = { ...mockIgdbGame, cover: undefined };
    mockTwitchAndIgdb([nocover]);
    const [result] = await searchGames('test');
    expect(result?.coverUrl).toBeNull();
  });

  it('throws when Twitch token fetch fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(searchGames('test')).rejects.toThrow('Twitch token fetch failed');
  });

  it('throws when IGDB request fails', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockToken })
      .mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(searchGames('test')).rejects.toThrow('IGDB games failed');
  });
});

describe('getGame', () => {
  it('returns a single game by igdbId', async () => {
    mockTwitchAndIgdb([mockIgdbGame]);
    const result = await getGame(101);
    expect(result?.igdbId).toBe(101);
    expect(result?.title).toBe('Hollow Knight');
  });

  it('returns null when IGDB returns empty array', async () => {
    mockTwitchAndIgdb([]);
    const result = await getGame(99999);
    expect(result).toBeNull();
  });

  it('caches the result — second call does not hit IGDB again', async () => {
    mockTwitchAndIgdb([mockIgdbGame]);
    await getGame(101);
    await getGame(101);
    expect(global.fetch).toHaveBeenCalledTimes(2); // token + one IGDB call
  });
});

describe('getUpcomingReleases', () => {
  it('returns upcoming games with correct shape', async () => {
    const upcoming = {
      ...mockIgdbGame,
      first_release_date: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days from now
      platforms: [{ name: 'PC (Microsoft Windows)' }],
      summary: 'A great game',
    };
    mockTwitchAndIgdb([upcoming]);

    const results = await getUpcomingReleases();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      igdbId: 101,
      title: 'Hollow Knight',
      wishlisted: false,
    });
    expect(results[0]?.releaseDate).not.toBeNull();
    expect(results[0]?.synopsis).toBe('A great game');
  });
});
