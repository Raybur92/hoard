// var is intentional: jest.mock factory runs lazily (during module load) before
// let/const declarations are initialised, so only var-hoisted bindings are safe to
// assign inside the factory closure.
// eslint-disable-next-line no-var
var _hltbSearchMock: jest.Mock;

jest.mock('howlongtobeat', () => {
  _hltbSearchMock = jest.fn();
  return {
    HowLongToBeatService: jest.fn().mockImplementation(() => ({
      search: _hltbSearchMock,
    })),
  };
});

import { fetchHltb } from './hltb';

function getMockSearch(): jest.Mock {
  return _hltbSearchMock;
}

describe('fetchHltb', () => {
  it('returns hours converted to minutes for a matching game', async () => {
    getMockSearch().mockResolvedValue([
      { gameplayMain: 15, gameplayMainExtra: 25, gameplayCompletionist: 40, similarity: 0.95 },
    ]);

    const result = await fetchHltb('Hollow Knight');

    expect(result).toEqual({
      mainStory: 900,      // 15h × 60
      mainExtras: 1500,    // 25h × 60
      completionist: 2400, // 40h × 60
    });
  });

  it('returns null when HLTB returns an empty array', async () => {
    getMockSearch().mockResolvedValue([]);
    const result = await fetchHltb('xyzzy');
    expect(result).toBeNull();
  });

  it('returns null and does not throw when HLTB search throws', async () => {
    getMockSearch().mockRejectedValue(new Error('Network error'));
    const result = await fetchHltb('some game');
    expect(result).toBeNull(); // silent failure per rule 8
  });

  it('stores null for a time value of 0 (game has no completion data)', async () => {
    getMockSearch().mockResolvedValue([
      { gameplayMain: 0, gameplayMainExtra: 0, gameplayCompletionist: 12, similarity: 0.9 },
    ]);
    const result = await fetchHltb('Short Game');
    expect(result?.mainStory).toBeNull();
    expect(result?.mainExtras).toBeNull();
    expect(result?.completionist).toBe(720); // 12h × 60
  });

  it('rounds fractional hours correctly', async () => {
    getMockSearch().mockResolvedValue([
      { gameplayMain: 41.5, gameplayMainExtra: 0, gameplayCompletionist: 0, similarity: 1 },
    ]);
    const result = await fetchHltb('Elden Ring');
    expect(result?.mainStory).toBe(2490); // 41.5 × 60 = 2490
  });
});
