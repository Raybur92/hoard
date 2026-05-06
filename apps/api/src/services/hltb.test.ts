import { fetchHltb, fetchHltbBySteamId, fetchHltbByGogId, fetchHltbWithFallback, igdbTimeToBeatToHltb } from './hltb';

// Mock the global fetch — hltb.ts calls hltbapi.codepotatoes.de/{steam|gog|hltb}/{id}
const mockFetch = jest.fn();
beforeEach(() => {
  global.fetch = mockFetch as unknown as typeof global.fetch;
  mockFetch.mockReset();
});

describe('fetchHltbBySteamId', () => {
  it('returns hours converted to minutes plus source/identifiers', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ mainStory: 15, mainStoryWithExtras: 25, completionist: 40, hltbId: 10270, gogAppId: 1207664663 }),
    });

    const result = await fetchHltbBySteamId(367520);

    expect(result).toEqual({
      mainStory: 900,
      mainExtras: 1500,
      completionist: 2400,
      source: 'hltb',
      hltbId: 10270,
      gogAppId: 1207664663,
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

  it('returns null when every time field is 0 / missing (no useful data)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ mainStory: 0, mainStoryWithExtras: 0, completionist: 0 }),
    });
    const result = await fetchHltbBySteamId(1);
    expect(result).toBeNull();
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

describe('fetchHltbByGogId', () => {
  it('hits the /gog/{id} endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ mainStory: 50, mainStoryWithExtras: 100, completionist: 170 }),
    });
    const result = await fetchHltbByGogId(1207664663);
    expect(result?.source).toBe('hltb');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/gog/1207664663'));
  });
});

describe('igdbTimeToBeatToHltb', () => {
  it('maps normally → mainStory and completely → completionist; no mainExtras equivalent', () => {
    const result = igdbTimeToBeatToHltb({ hastily: 1800, normally: 36000, completely: 72000 });
    expect(result).toEqual({
      mainStory: 600,       // 36000s = 600m
      mainExtras: null,
      completionist: 1200,  // 72000s = 1200m
      source: 'igdb',
    });
  });

  it('returns null when both relevant fields are missing', () => {
    const result = igdbTimeToBeatToHltb({ hastily: 1800, normally: null, completely: null });
    expect(result).toBeNull();
  });

  it('returns null when the IGDB field itself is null', () => {
    expect(igdbTimeToBeatToHltb(null)).toBeNull();
  });
});

describe('fetchHltbWithFallback', () => {
  it('returns HLTB result when Steam-ID match succeeds', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ mainStory: 10, mainStoryWithExtras: 20, completionist: 30, hltbId: 999 }),
    });
    const result = await fetchHltbWithFallback('Hollow Knight', 367520, null);
    expect(result?.source).toBe('hltb');
    expect(result?.mainStory).toBe(600);
    expect(result?.hltbId).toBe(999);
  });

  it('falls back to IGDB when Steam-ID lookup returns no useful data', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ mainStory: 0, mainStoryWithExtras: 0, completionist: 0 }),
    });
    const result = await fetchHltbWithFallback('Title', 367520, { hastily: null, normally: 18000, completely: 36000 });
    expect(result?.source).toBe('igdb');
    expect(result?.mainStory).toBe(300);
  });

  it('uses IGDB directly when no steamAppId is given', async () => {
    const result = await fetchHltbWithFallback('PSN-only Title', null, { hastily: null, normally: 7200, completely: null });
    expect(result?.source).toBe('igdb');
    expect(result?.mainStory).toBe(120);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null when neither source has data', async () => {
    const result = await fetchHltbWithFallback('Anything', null, null);
    expect(result).toBeNull();
  });
});

describe('fetchHltb (legacy export)', () => {
  it('still delegates to fetchHltbBySteamId when an id is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ mainStory: 10, mainStoryWithExtras: 20, completionist: 30 }),
    });
    const result = await fetchHltb('Hollow Knight', 367520);
    expect(result?.mainStory).toBe(600);
  });

  it('returns null when no steamAppId is provided (no title-based fallback)', async () => {
    const result = await fetchHltb('Some Game');
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
