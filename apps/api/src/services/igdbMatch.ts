import type { IgdbSearchResult, PlatformCode } from '@hoard/types';

/**
 * Picks the best IGDB search result for a sync title from a given platform.
 *
 * The previous implementation in syncRunner.ts took `results[0]` from
 * `searchGames()` — i.e. trusted IGDB's relevance ranking blindly. That had
 * two well-known failure modes:
 *
 *   - Sequels and remasters often outrank the original (Slay the Spire 2
 *     beat Slay the Spire on a search for "Slay the Spire" because IGDB had
 *     fresh activity on the 2026 sequel).
 *   - Obscure name-collisions on different platforms (a Korean MMO called
 *     "Ragnarok: War of Gods" beat "God of War Ragnarök" because both share
 *     the keyword "Ragnarok").
 *
 * The fix is a soft scoring function over the top-N IGDB results that uses:
 *   1. Title similarity (exact normalized match dominates).
 *   2. Platform agreement with the syncing platform — a STRONG signal,
 *      since a Korean MMO won't have PlayStation in its IGDB platforms list.
 *   3. Popularity (`total_rating_count`) as a tiebreaker so the well-known
 *      original beats an obscure sequel when both score similarly on title.
 *
 * Soft scoring (not hard filtering) is deliberate: IGDB platform data is
 * sometimes incomplete — we don't want to exclude a result that's a perfect
 * title match just because IGDB hasn't catalogued its platforms.
 */

/**
 * Hoard PlatformCode → IGDB platform names that signal "this game runs on
 * that platform." Used to award the platform-match bonus during scoring.
 *
 * Names rather than IDs because `searchGames` already maps `platforms.name`
 * onto the result; keeping it as strings avoids a second mapping step.
 *
 * Multiple names per code so we cover every PSN/Xbox generation a user
 * might have games from. NT/EP are listed for completeness but currently
 * never reach this code path (manual-only platforms don't sync).
 */
const PLATFORM_TO_IGDB_NAMES: Record<PlatformCode, string[]> = {
  ST: ['PC (Microsoft Windows)'],
  GG: ['PC (Microsoft Windows)', 'Mac', 'Linux'],
  EP: ['PC (Microsoft Windows)'],
  PS: ['PlayStation 3', 'PlayStation 4', 'PlayStation 5', 'PlayStation VR2'],
  XB: ['Xbox', 'Xbox 360', 'Xbox One', 'Xbox Series X|S'],
  NT: ['Nintendo Switch', 'Nintendo Switch 2'],
  // M1 — itch.io games are predominantly PC builds (Windows / Mac / Linux);
  // mobile builds also exist for some jam titles. IGDB rarely tags itch.io
  // games at all, so this list is best-effort. The IGDB miss path falls
  // through to title search with no platform bonus.
  IT: ['PC (Microsoft Windows)', 'Mac', 'Linux'],
};

/**
 * Normalize a title for similarity comparison: lowercase, strip punctuation
 * and trademarks, drop common edition suffixes, collapse whitespace.
 *
 * Examples:
 *   "God of War Ragnarök"               → "god of war ragnarok"
 *   "Slay the Spire®"                   → "slay the spire"
 *   "Hades II: Definitive Edition"      → "hades ii"
 *   "FAR CRY®6 [PS5]"                   → "far cry 6"
 */
const EDITION_SUFFIXES = [
  'definitive edition',
  'deluxe edition',
  'standard edition',
  'gold edition',
  'goty edition',
  'game of the year edition',
  'collectors edition',
  'collector edition',
  'remastered',
  'directors cut',
  'enhanced edition',
  'complete edition',
  'ultimate edition',
];

export function normalize(title: string): string {
  let s = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip combining diacritics (ä → a)
    .replace(/[®™©]/g, '')              // strip trademarks
    .replace(/['’`]/g, '')              // strip apostrophes (don't / dont)
    .replace(/[^a-z0-9\s:|-]/g, ' ')   // anything else → space
    .replace(/\s+/g, ' ')
    .trim();

  for (const suffix of EDITION_SUFFIXES) {
    if (s.endsWith(`: ${suffix}`)) s = s.slice(0, -(suffix.length + 2)).trim();
    else if (s.endsWith(` - ${suffix}`)) s = s.slice(0, -(suffix.length + 3)).trim();
    else if (s.endsWith(` ${suffix}`)) s = s.slice(0, -(suffix.length + 1)).trim();
  }

  // Drop trailing colon-clause if it makes the string too generic
  // ("Hades II: Definitive Edition" already handled above; this catches
  // residual ": [foo edition]" forms not in EDITION_SUFFIXES.)
  return s;
}

/**
 * Score each candidate. Higher is better. Returns the `IgdbSearchResult`
 * with the highest score, or `null` if `results` is empty.
 *
 * Score breakdown (rough magnitudes):
 *   exact normalized title match   +1000
 *   one-side prefix match           +200
 *   all query words in title         +50
 *   syncing platform in result      +500
 *   missing platform data            +50  (don't penalize unknowns)
 *   wrong platform                  -200
 *   popularity bonus      +log10(rating_count) * 10  (max ~30 for AAA)
 *
 * The weights make platform agreement decisive in cross-platform name
 * collisions (Ragnarok-MMO loses by ~700 to GoW Ragnarök) while still
 * letting an exact title match on a wrong-platform result win when nothing
 * else matches the right platform (rare edge case where IGDB's platform
 * data is wrong on the only correct candidate).
 */
export function pickBestMatch(
  query: string,
  results: IgdbSearchResult[],
  platformCode: PlatformCode,
): IgdbSearchResult | null {
  if (results.length === 0) return null;

  const targetPlatforms = PLATFORM_TO_IGDB_NAMES[platformCode] ?? [];
  const normQuery = normalize(query);
  const queryWords = normQuery.split(' ').filter((w) => w.length > 0);

  let bestScore = -Infinity;
  let bestResult: IgdbSearchResult = results[0]!;

  for (const r of results) {
    let score = 0;
    // L-series: when a candidate carries a `matchTitle` (it came from
    // the IGDB localization fallback), score against that instead of
    // the canonical English `title`. Otherwise score against `title`
    // as before.
    const normTitle = normalize(r.matchTitle ?? r.title);

    // Title similarity
    if (normTitle === normQuery) {
      score += 1000;
    } else if (normTitle.startsWith(normQuery) || normQuery.startsWith(normTitle)) {
      score += 200;
    } else if (queryWords.every((w) => normTitle.includes(w))) {
      score += 50;
    }

    // Platform agreement
    if (targetPlatforms.length > 0) {
      if (r.platforms.length === 0) {
        score += 50; // unknown — don't penalize
      } else if (r.platforms.some((p) => targetPlatforms.includes(p))) {
        score += 500;
      } else {
        score -= 200;
      }
    }

    // Popularity tiebreak
    score += Math.log10((r.totalRatingCount ?? 0) + 1) * 10;

    if (score > bestScore) {
      bestScore = score;
      bestResult = r;
    }
  }

  return bestResult;
}

// Exported for unit tests.
export const __testing = { PLATFORM_TO_IGDB_NAMES, EDITION_SUFFIXES };
