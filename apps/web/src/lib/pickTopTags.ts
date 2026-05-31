import type { UserGameDetail } from '@hoard/types';

/**
 * B-IGDB-3b1 — derive the top-N tag values for a Library chip strip from
 * a set of loaded games. Sorted by occurrence count descending; ties broken
 * by tag name asc (deterministic). Used by the secondary filter chip rows
 * on `/library/:status` for the genre / theme / perspective dimensions.
 *
 * The chip values are intentionally shelf-scoped — when the user is viewing
 * the Backlog shelf, they see only the tags that occur in Backlog. This is
 * symmetric with how the existing platform chip strip behaves (platform
 * options aren't pre-computed library-wide either).
 *
 * Empty result when no game in the input set carries any tag for the
 * dimension — caller hides the chip row entirely in that case.
 */
export type TagDimension = 'genre' | 'theme' | 'perspective';

/**
 * Default chip cap — bumped 6 → 20 (2026-05-31) after Andrea's feedback
 * "the video game industry is not made of six genres." IGDB's full set
 * sizes: ~20 genres, ~25 themes, ~8 perspectives. 20 covers genres + most
 * themes without overflow; the chip strip uses `flex-wrap: wrap` on
 * desktop (multi-line is fine) and `overflow-x: auto` on mobile
 * (horizontal scroll), so a longer list degrades gracefully.
 */
export function pickTopTags(
  games: UserGameDetail[],
  dimension: TagDimension,
  cap = 20,
): string[] {
  return pickTopTagCounts(games, dimension, cap).map(({ name }) => name);
}

/**
 * Same ordering as {@link pickTopTags} but returns occurrence counts.
 * Used by the FilterPopover to show `RPG (31)` next to each option.
 */
export interface TagCount { name: string; count: number; }
export function pickTopTagCounts(
  games: UserGameDetail[],
  dimension: TagDimension,
  cap = 20,
): TagCount[] {
  const counts = new Map<string, number>();
  for (const g of games) {
    const arr = dimension === 'genre'
      ? g.game.genres
      : dimension === 'theme'
        ? g.game.themes
        : g.game.playerPerspectives;
    if (!arr) continue;
    for (const tag of arr) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort(([aName, aCount], [bName, bCount]) =>
      bCount - aCount || aName.localeCompare(bName),
    )
    .slice(0, cap)
    .map(([name, count]) => ({ name, count }));
}

/**
 * Filter a games list by tag value on the given dimension. `null` /
 * `undefined` value means no filter (returns input as-is).
 */
export function filterByTag(
  games: UserGameDetail[],
  dimension: TagDimension,
  value: string | null | undefined,
): UserGameDetail[] {
  if (!value) return games;
  return games.filter((g) => {
    const arr = dimension === 'genre'
      ? g.game.genres
      : dimension === 'theme'
        ? g.game.themes
        : g.game.playerPerspectives;
    return arr?.includes(value) ?? false;
  });
}
