/**
 * GD-PR4a — sigil classifier for the archivist relic (OQ-GD-13).
 *
 * Ported from the design prototype at scripts/relic-composition.ts. The
 * locked rules:
 *
 *   - 3-dimension system: GENRE / THEME / PERSPECTIVE
 *   - 24 unique sigils across all dimensions (1 sigil = 1 value globally)
 *   - 7 + fallback clusters per dimension; perspective is direct-mapped
 *     to the 7 IGDB values + a SHROUD fallback
 *   - Cluster priority order: MORE SPECIFIC tags beat BROADER ones
 *     (Platform beats Adventure for genre; Horror beats Action for theme)
 *
 * The API ships ONLY sigil NAMES + dimension labels. SVG path bodies
 * live in the frontend bundle (`apps/web/src/components/screens/gameDetail/relicSigils.ts`)
 * per GD-PR4-D2. Frontend looks up by name.
 *
 * Source-of-truth for the cluster rules is THIS file; the prototype
 * script stays in lockstep so it remains a faithful design preview.
 */

import type { SigilAssignment } from '@hoard/types';

/* ── GENRE clusters (7 + fallback ASYLUM) ── */
export const GENRE_RULES: Array<{ cluster: string; matches: string[] }> = [
  { cluster: 'MUSIC',    matches: ['Music'] },
  { cluster: 'CIRCUIT',  matches: ['Simulator', 'Sport', 'Racing', 'Pinball'] },
  { cluster: 'JUMP',     matches: ['Platform'] },
  { cluster: 'STRATEGY', matches: ['Real Time Strategy (RTS)', 'Turn-based strategy (TBS)', 'Strategy', 'Tactical', 'MOBA'] },
  { cluster: 'MIND',     matches: ['Puzzle', 'Quiz/Trivia', 'Card & Board Game'] },
  { cluster: 'COMBAT',   matches: ['Fighting', 'Hack and slash/Beat \'em up', 'Shooter', 'Arcade'] },
  { cluster: 'QUEST',    matches: ['Role-playing (RPG)', 'Adventure', 'Visual Novel', 'Point-and-click'] },
];

export const GENRE_SIGIL: Record<string, string> = {
  QUEST:    'star-8',
  COMBAT:   'cross',
  STRATEGY: 'target',
  JUMP:     'wedge',
  MIND:     'cluster',
  CIRCUIT:  'rings',
  MUSIC:    'wave',
  ASYLUM:   'half',
};

/* ── THEME clusters (7 + fallback APOCRYPHA) ── */
export const THEME_RULES: Array<{ cluster: string; matches: string[] }> = [
  { cluster: 'DREAD',  matches: ['Horror', 'Thriller', 'Survival', 'Stealth'] },
  { cluster: 'REALM',  matches: ['Fantasy'] },
  { cluster: 'COSMOS', matches: ['Science fiction', '4X (explore, expand, exploit, and exterminate)'] },
  { cluster: 'PROSE',  matches: ['Drama', 'Mystery', 'Non-fiction', 'Romance'] },
  { cluster: 'MIRTH',  matches: ['Comedy', 'Party', 'Kids'] },
  { cluster: 'AGES',   matches: ['Historical', 'Educational', 'Business'] },
  { cluster: 'CHAOS',  matches: ['Action', 'Sandbox', 'Open world', 'Warfare'] },
];

export const THEME_SIGIL: Record<string, string> = {
  REALM:     'trefoil',
  COSMOS:    'orbit',
  DREAD:     'eye',
  MIRTH:     'sunburst',
  PROSE:     'stairs',
  AGES:      'hex',
  CHAOS:     'flame',
  APOCRYPHA: 'asterisk-6',
};

/* ── PERSPECTIVES (direct mapping — small enough vocab, no clustering) ── */
export const PERSPECTIVE_SIGIL: Record<string, string> = {
  'First person':           'ring-dot',
  'Third person':           'cube-iso',
  'Bird view / Isometric':  'box',
  'Side view':              'ladder',
  'Text':                   'block',
  'Auditory':               'diamond',
  'Virtual Reality':        'orb',
  'SHROUD':                 'spiral',
};

/* ── Classifiers ── */

export function classifyGenre(tags: string[]): string {
  for (const r of GENRE_RULES) if (tags.some((t) => r.matches.includes(t))) return r.cluster;
  return 'ASYLUM';
}

export function classifyTheme(tags: string[]): string {
  for (const r of THEME_RULES) if (tags.some((t) => r.matches.includes(t))) return r.cluster;
  return 'APOCRYPHA';
}

export function classifyPerspective(tags: string[]): string {
  for (const t of tags) if (PERSPECTIVE_SIGIL[t]) return t;
  return 'SHROUD';
}

/**
 * Assigns the 3 sigil marks (GENRE / THEME / PERSPECTIVE) for a game.
 * Returns ALWAYS 3 entries — fallbacks fire when classifiers can't
 * place a tag in a cluster.
 */
export function assignSigils(
  genres: string[],
  themes: string[],
  perspectives: string[],
): SigilAssignment[] {
  const genre = classifyGenre(genres);
  const theme = classifyTheme(themes);
  const perspective = classifyPerspective(perspectives);
  return [
    { dimension: 'GENRE',       value: genre,       sigilName: GENRE_SIGIL[genre] ?? 'half' },
    { dimension: 'THEME',       value: theme,       sigilName: THEME_SIGIL[theme] ?? 'asterisk-6' },
    { dimension: 'PERSPECTIVE', value: perspective, sigilName: PERSPECTIVE_SIGIL[perspective] ?? 'spiral' },
  ];
}
