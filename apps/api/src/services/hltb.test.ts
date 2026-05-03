import { fetchHltb, fetchHltbBySteamId } from './hltb';

// Mock the global fetch — hltb.ts calls hltbapi.codepotatoes.de/steam/{id}
const mockFetch = jest.fn();
beforeEach(() => {
  global.fetch = mockFetch as unknown as typeof global.fetch;
  mockFetch.mockReset();
});

describe('fetchHltbBySteamId', () => {
  it('returns hours converted to minutes for a matching game', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ mainStory: 15, mainStoryWithExtras: 25, completionist: 40 }),
    });

    const result = await fetchHltbBySteamId(367520);

    expect(result).toEqual({
      mainStory: 900,      // 15h × 60
      mainExtras: 1500,    // 25h × 60
      completionist: 2400, // 40h × 60
    });
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/steam/367520'));
  });

  it('returns null when the API responds non-OK', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    const result = await fetchHltbBySteamId(99999999);
    expect(result).toBeNull();
  });

  it('returns null and does not throw when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const result = await fetchHltbBySteamId(367520);
    expect(result).toBeNull(); // silent failure per rule 8
  });

  it('stores null for a time value of 0 (game has no completion data)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ mainStory: 0, mainStoryWithExtras: 0, completionist: 12 }),
    });
    const result = await fetchHltbBySteamId(123);
    expect(result?.mainStory).toBeNull();
    expect(result?.mainExtras).toBeNull();
    expect(result?.completionist).toBe(720); // 12h × 60
  });

  it('rounds fractional hours correctly', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ mainStory: 41.5, mainStoryWithExtras: 0, completionist: 0 }),
    });
    const result = await fetchHltbBySteamId(1245620);
    expect(result?.mainStory).toBe(2490); // 41.5 × 60 = 2490
  });
});

describe('fetchHltb', () => {
  it('delegates to fetchHltbBySteamId when a steamAppId is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ mainStory: 10, mainStoryWithExtras: 20, completionist: 30 }),
    });
    const result = await fetchHltb('Hollow Knight', 367520);
    expect(result).toEqual({ mainStory: 600, mainExtras: 1200, completionist: 1800 });
  });

  it('returns null when no steamAppId is provided (no title-based fallback)', async () => {
    const result = await fetchHltb('Some Game');
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
