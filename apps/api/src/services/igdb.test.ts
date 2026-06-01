import {
  searchGames,
  getGame,
  getUpcomingReleases,
  searchGameLocalizations,
  getGameByPsnConceptId,
  getGameByXboxTitleId,
  getGameByGogAppId,
  clearCaches,
  scoreHeroImage,
  pickBestHeroImage,
} from './igdb';

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

    const results = await getUpcomingReleases({ platformIds: [], allPlatforms: true, hypeThreshold: 0 });
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

describe('searchGameLocalizations (L-series)', () => {
  it('looks up the localizations endpoint, resolves parents, and returns matchTitle from the localized name', async () => {
    // 1st: twitch token. 2nd: game_localizations search. 3rd: games endpoint resolve.
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockToken })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 9001, name: "LEGO Batman: L'Eredità del Cavaliere Oscuro", game: 12345 },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 12345,
            name: 'LEGO Batman: Legacy of the Dark Knight',
            first_release_date: 1735689600,
            platforms: [{ id: 167, name: 'PlayStation 5' }],
            involved_companies: [{ company: { name: 'TT Games' }, developer: true }],
          },
        ],
      });

    const results = await searchGameLocalizations("LEGO Batman: L'Eredità del Cavaliere Oscuro");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      igdbId: 12345,
      title: 'LEGO Batman: Legacy of the Dark Knight',         // canonical English
      matchTitle: "LEGO Batman: L'Eredità del Cavaliere Oscuro", // localized for matching
      developer: 'TT Games',
      platforms: ['PlayStation 5'],
    });
  });

  it('dedupes parent games when multiple localization rows share the same game id', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockToken })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 1, name: 'Some Localized Title (IT)', game: 555 },
          { id: 2, name: 'Some Localized Title (FR)', game: 555 }, // same parent
          { id: 3, name: 'Other Localization (IT)', game: 666 },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 555, name: 'English A' },
          { id: 666, name: 'English B' },
        ],
      });

    const results = await searchGameLocalizations('whatever');

    // Two parents resolved, not three. First-seen localization wins on dedupe.
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.igdbId === 555)?.matchTitle).toBe('Some Localized Title (IT)');
    expect(results.find((r) => r.igdbId === 666)?.matchTitle).toBe('Other Localization (IT)');
  });

  it('returns [] when the localizations endpoint returns no matches', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockToken })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    const results = await searchGameLocalizations('Definitely Not A Real Title');
    expect(results).toEqual([]);
  });

  it('returns [] on IGDB error so callers can fall through gracefully', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockToken })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });

    const results = await searchGameLocalizations('anything');
    expect(results).toEqual([]);
  });

  it('returns [] when the parent-games resolution fails (degrades gracefully)', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockToken })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 1, name: 'Loc', game: 100 }],
      })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });

    const results = await searchGameLocalizations('q');
    expect(results).toEqual([]);
  });
});

describe('N-series external_games helpers', () => {
  it('getGameByPsnConceptId queries by PSN URL pattern + returns mapped result', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockToken })
      .mockImplementationOnce(async (_url, init: { body: string }) => {
        // Verify the body specifies the PSN storefront URL pattern + uid.
        expect(init.body).toContain('store.playstation.com');
        expect(init.body).toContain('uid = "10008537"');
        return {
          ok: true,
          json: async () => [{
            game: {
              id: 361855,
              name: 'LEGO Batman: Legacy of the Dark Knight',
              first_release_date: 1735689600,
              platforms: [{ id: 167, name: 'PlayStation 5' }],
              involved_companies: [{ company: { name: 'TT Games' }, developer: true }],
            },
          }],
        };
      });

    const result = await getGameByPsnConceptId(10008537);
    expect(result).toMatchObject({
      igdbId: 361855,
      title: 'LEGO Batman: Legacy of the Dark Knight',
      developer: 'TT Games',
      platforms: ['PlayStation 5'],
    });
  });

  it('getGameByXboxTitleId queries by Microsoft URL pattern', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockToken })
      .mockImplementationOnce(async (_url, init: { body: string }) => {
        expect(init.body).toContain('microsoft.com');
        expect(init.body).toContain('uid = "2030093255"');
        return {
          ok: true,
          json: async () => [{
            game: { id: 444, name: 'Forza Horizon 5' },
          }],
        };
      });

    const result = await getGameByXboxTitleId(2030093255);
    expect(result?.igdbId).toBe(444);
  });

  it('getGameByGogAppId queries by gog.com URL pattern', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockToken })
      .mockImplementationOnce(async (_url, init: { body: string }) => {
        expect(init.body).toContain('gog.com');
        expect(init.body).toContain('uid = "1207664663"');
        return {
          ok: true,
          json: async () => [{
            game: { id: 555, name: 'The Witcher 3: Wild Hunt' },
          }],
        };
      });

    const result = await getGameByGogAppId(1207664663);
    expect(result?.igdbId).toBe(555);
  });

  it('returns null when IGDB has no external_games row for the uid (empty response)', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockToken })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    expect(await getGameByPsnConceptId(999999)).toBeNull();
  });

  it('returns null on IGDB error (graceful degradation — syncRunner falls through to title search)', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockToken })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });

    expect(await getGameByPsnConceptId(123)).toBeNull();
  });
});

describe('B-Art-1 — scoreHeroImage', () => {
  it('returns -1000 when image_id matches the cover (duplicate veto)', () => {
    const score = scoreHeroImage({ image_id: 'cov123', width: 1920, height: 1080 }, 'cov123');
    expect(score).toBe(-1000);
  });

  it('returns positive baseline (1) when dimensions are missing', () => {
    expect(scoreHeroImage({ image_id: 'x' }, null)).toBe(1);
    expect(scoreHeroImage({ image_id: 'x', width: 0, height: 0 }, null)).toBe(1);
  });

  it('scores a perfect 16:9 image with high resolution higher than a portrait of the same area', () => {
    const landscape = scoreHeroImage({ image_id: 'l', width: 1920, height: 1080 }, null);
    const portrait = scoreHeroImage({ image_id: 'p', width: 1080, height: 1920 }, null);
    expect(landscape).toBeGreaterThan(portrait);
  });

  it('aspect-score decays linearly with distance from 16:9', () => {
    // 16:9 ≈ 1.778. A 1:1 image (aspect=1) is 0.778 away → aspect penalty 0.778 * 60 ≈ 46.7
    const square = scoreHeroImage({ image_id: 's', width: 1000, height: 1000 }, null);
    const landscape = scoreHeroImage({ image_id: 'l', width: 1778, height: 1000 }, null);
    expect(landscape).toBeGreaterThan(square);
  });

  it('resolution score is log-scaled (4K beats 1080p but not by 4×)', () => {
    const hd = scoreHeroImage({ image_id: 'hd', width: 1920, height: 1080 }, null);
    const fourK = scoreHeroImage({ image_id: '4k', width: 3840, height: 2160 }, null);
    expect(fourK).toBeGreaterThan(hd);
    // log-scaled — 4× the pixels should not double the score
    expect(fourK).toBeLessThan(hd * 2);
  });
});

describe('B-Art-1 — pickBestHeroImage (two-stage: artworks-first, screenshots-fallback)', () => {
  it('returns null when both arrays are empty', () => {
    expect(pickBestHeroImage([], [], null)).toBeNull();
    expect(pickBestHeroImage(null, null, null)).toBeNull();
    expect(pickBestHeroImage(undefined, undefined, null)).toBeNull();
  });

  it('returns the screenshot URL pattern (t_screenshot_big)', () => {
    const url = pickBestHeroImage(
      [{ image_id: 'abc', width: 1920, height: 1080 }],
      [],
      null,
    );
    expect(url).toBe('https://images.igdb.com/igdb/image/upload/t_screenshot_big/abc.jpg');
  });

  it('Stage 1 — respects IGDB array order (no algorithmic tiebreak inside the artworks pool)', () => {
    // First artwork is slightly off-16:9; second is a clean 16:9. Both
    // are landscape and eligible for stage 1. Andrea 2026-06-01 lock:
    // IGDB array order wins (editorial curation). No scoring inside.
    const url = pickBestHeroImage(
      [
        { image_id: 'first', width: 1200, height: 900 },
        { image_id: 'second', width: 1920, height: 1080 },
      ],
      [],
      null,
    );
    expect(url).toContain('/first.jpg');
  });

  it('Stage 1 — skips a portrait artwork (width < height) and tries the next', () => {
    const url = pickBestHeroImage(
      [
        { image_id: 'portrait', width: 600, height: 900 },
        { image_id: 'landscape', width: 1920, height: 1080 },
      ],
      [],
      null,
    );
    expect(url).toContain('landscape');
  });

  it('Stage 1 — skips the cover-duplicate artwork and picks the next-best candidate', () => {
    const url = pickBestHeroImage(
      [
        { image_id: 'cov123', width: 1920, height: 1080 }, // same as cover
        { image_id: 'real', width: 1600, height: 900 },
      ],
      [],
      'cov123',
    );
    expect(url).toContain('real');
  });

  it('Stage 1 wins over Stage 2 when a usable artwork exists (artworks-first lock)', () => {
    // The artwork is non-16:9 (1600×900 = 1.78 → actually 16:9, change for fair test)
    // Use a 1600×1000 artwork (slightly off) vs a clean 1920×1080 screenshot.
    // The v1 single-pool scorer would have picked the screenshot; v2 must
    // pick the artwork.
    const url = pickBestHeroImage(
      [{ image_id: 'art', width: 1600, height: 1000 }],
      [{ image_id: 'screen', width: 1920, height: 1080 }],
      null,
    );
    expect(url).toContain('/art.jpg');
    expect(url).not.toContain('/screen.jpg');
  });

  it('Stage 2 — falls back to screenshots when every artwork is portrait or cover-duplicate', () => {
    const url = pickBestHeroImage(
      [
        { image_id: 'portrait', width: 800, height: 1200 },
        { image_id: 'cov123', width: 1920, height: 1080 },
      ],
      [{ image_id: 'fallback', width: 1920, height: 1080 }],
      'cov123',
    );
    expect(url).toContain('/fallback.jpg');
  });

  it('Stage 2 — falls back to screenshots when artworks array is empty', () => {
    const url = pickBestHeroImage(
      [],
      [{ image_id: 'fallback', width: 1920, height: 1080 }],
      null,
    );
    expect(url).toContain('/fallback.jpg');
  });

  it('returns null when every artwork is unusable AND every screenshot is the cover duplicate', () => {
    const url = pickBestHeroImage(
      [{ image_id: 'cov123', width: 600, height: 800 }],
      [{ image_id: 'cov123', width: 600, height: 800 }],
      'cov123',
    );
    expect(url).toBeNull();
  });

  it('uses a missing-dimension artwork (treated as non-portrait by default) as stage 1', () => {
    // Missing dimensions get benefit-of-the-doubt: NOT classified as
    // portrait, eligible for stage 1.
    const url = pickBestHeroImage(
      [{ image_id: 'unknownDims' }],
      [{ image_id: 'screenshot', width: 1920, height: 1080 }],
      null,
    );
    expect(url).toContain('unknownDims');
  });
});
