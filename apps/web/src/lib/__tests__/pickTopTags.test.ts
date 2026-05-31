/**
 * B-IGDB-3b1 — `pickTopTags` derives Library chip-row values from the
 * games loaded into the current shelf view. Order is count desc, then
 * tag name asc (deterministic tiebreak). `filterByTag` is the composable
 * predicate the chip click hands to applyFilters.
 */

import { describe, it, expect } from 'vitest';
import type { UserGameDetail } from '@hoard/types';
import { pickTopTags, filterByTag } from '../pickTopTags';

function makeGame(overrides: {
  id?: string;
  genres?: string[];
  themes?: string[];
  playerPerspectives?: string[];
} = {}): UserGameDetail {
  return {
    id: overrides.id ?? 'ug-1',
    userId: 'u1',
    gameId: overrides.id ?? 'g-1',
    game: {
      id: overrides.id ?? 'g-1',
      igdbId: 1,
      title: 'Test',
      developer: null,
      releaseYear: null,
      genres: overrides.genres ?? [],
      themes: overrides.themes ?? [],
      playerPerspectives: overrides.playerPerspectives ?? [],
      coverUrl: null,
      hltbId: null,
      gogAppId: null,
      psnNpCommunicationId: null,
    },
    status: 'Backlog',
    playtimeByPlatform: {},
    achievementsByPlatform: {},
    wishlistedPlatforms: [],
    mediaType: 'DIGITAL',
    condition: null,
    region: null,
    manualPlaytimeMinutes: null,
    lastPlayedAt: null,
    notes: null,
    rating: null,
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    hltb: null,
  } as unknown as UserGameDetail;
}

describe('pickTopTags', () => {
  it('returns tags ordered by occurrence count desc, then by name asc', () => {
    const games = [
      makeGame({ id: '1', genres: ['Action', 'RPG'] }),
      makeGame({ id: '2', genres: ['RPG', 'Strategy'] }),
      makeGame({ id: '3', genres: ['RPG'] }),
      makeGame({ id: '4', genres: ['Action'] }),
    ];
    // Counts: RPG=3, Action=2, Strategy=1
    expect(pickTopTags(games, 'genre')).toEqual(['RPG', 'Action', 'Strategy']);
  });

  it('breaks count ties by tag name ascending (deterministic)', () => {
    const games = [
      makeGame({ id: '1', themes: ['Fantasy', 'Sci-Fi'] }),
      makeGame({ id: '2', themes: ['Horror', 'Mystery'] }),
    ];
    // All counts = 1; alphabetical tiebreak.
    expect(pickTopTags(games, 'theme')).toEqual(['Fantasy', 'Horror', 'Mystery', 'Sci-Fi']);
  });

  it('caps at `cap` entries (default 20; covers IGDB\'s full genre + theme set)', () => {
    // Default cap bumped 6 → 20 on 2026-05-31 after Andrea's "the video
    // game industry is not made of six genres" feedback. 25 distinct values
    // proves the 20-cap kicks in; the explicit `cap=3` proves the param
    // still overrides.
    const games = Array.from({ length: 25 }, (_, i) =>
      makeGame({ id: String(i), genres: [`Genre${i}`] }),
    );
    expect(pickTopTags(games, 'genre')).toHaveLength(20);
    expect(pickTopTags(games, 'genre', 3)).toHaveLength(3);
  });

  it('reads the correct dimension (genre vs theme vs perspective)', () => {
    const games = [
      makeGame({
        genres: ['Action'],
        themes: ['Horror'],
        playerPerspectives: ['First-person'],
      }),
    ];
    expect(pickTopTags(games, 'genre')).toEqual(['Action']);
    expect(pickTopTags(games, 'theme')).toEqual(['Horror']);
    expect(pickTopTags(games, 'perspective')).toEqual(['First-person']);
  });

  it('returns empty when no game carries any tag for the dimension', () => {
    // Mid-rollout: backfill hasn't reached this shelf yet — themes empty.
    const games = [
      makeGame({ id: '1', genres: ['Action'], themes: [], playerPerspectives: [] }),
    ];
    expect(pickTopTags(games, 'theme')).toEqual([]);
    expect(pickTopTags(games, 'perspective')).toEqual([]);
  });

  it('handles empty game list', () => {
    expect(pickTopTags([], 'genre')).toEqual([]);
  });
});

describe('filterByTag', () => {
  it('returns input unchanged when value is null', () => {
    const games = [makeGame({ id: '1', genres: ['Action'] })];
    expect(filterByTag(games, 'genre', null)).toEqual(games);
  });

  it('returns input unchanged when value is undefined', () => {
    const games = [makeGame({ id: '1', genres: ['Action'] })];
    expect(filterByTag(games, 'genre', undefined)).toEqual(games);
  });

  it('filters to games whose dimension array contains the value', () => {
    const games = [
      makeGame({ id: '1', genres: ['Action'] }),
      makeGame({ id: '2', genres: ['RPG'] }),
      makeGame({ id: '3', genres: ['Action', 'RPG'] }),
    ];
    const result = filterByTag(games, 'genre', 'Action');
    expect(result.map((g) => g.id)).toEqual(['1', '3']);
  });

  it('returns empty when no game carries the tag (e.g., pre-backfill)', () => {
    const games = [
      makeGame({ id: '1', genres: ['Action'], themes: [] }),
    ];
    expect(filterByTag(games, 'theme', 'Horror')).toEqual([]);
  });

  it('reads the correct dimension when filtering', () => {
    const games = [
      makeGame({ id: '1', genres: ['Action'], themes: ['Horror'], playerPerspectives: ['First-person'] }),
      makeGame({ id: '2', genres: ['Action'], themes: ['Fantasy'], playerPerspectives: ['Third-person'] }),
    ];
    // Both games have genre=Action but only #1 has theme=Horror.
    expect(filterByTag(games, 'genre', 'Action').map((g) => g.id)).toEqual(['1', '2']);
    expect(filterByTag(games, 'theme', 'Horror').map((g) => g.id)).toEqual(['1']);
    expect(filterByTag(games, 'perspective', 'First-person').map((g) => g.id)).toEqual(['1']);
  });
});
