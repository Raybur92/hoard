import {
  classifyGenre,
  classifyTheme,
  classifyPerspective,
  assignSigils,
  GENRE_SIGIL,
  THEME_SIGIL,
  PERSPECTIVE_SIGIL,
} from './relicSigils';

describe('GD-PR4a — classifyGenre', () => {
  it('returns ASYLUM when no IGDB tag matches any rule', () => {
    expect(classifyGenre([])).toBe('ASYLUM');
    expect(classifyGenre(['Indie'])).toBe('ASYLUM');
  });

  it('returns the cluster name when a single tag matches', () => {
    expect(classifyGenre(['Role-playing (RPG)'])).toBe('QUEST');
    expect(classifyGenre(['Music'])).toBe('MUSIC');
    expect(classifyGenre(['Platform'])).toBe('JUMP');
  });

  it('honours priority order (MUSIC beats anything; MUSIC + RPG → MUSIC)', () => {
    expect(classifyGenre(['Music', 'Role-playing (RPG)'])).toBe('MUSIC');
  });

  it('absorbs adjacent genres into the same cluster (Tactical → STRATEGY; Shooter → COMBAT)', () => {
    expect(classifyGenre(['Tactical'])).toBe('STRATEGY');
    expect(classifyGenre(['Shooter'])).toBe('COMBAT');
    expect(classifyGenre(['Card & Board Game'])).toBe('MIND');
    expect(classifyGenre(['Racing'])).toBe('CIRCUIT');
  });

  it('falls through when only an irrelevant tag is present', () => {
    expect(classifyGenre(['Visual Novel'])).toBe('QUEST'); // matches
    expect(classifyGenre(['Indie', 'Adventure'])).toBe('QUEST'); // Indie ignored, Adventure matches
  });
});

describe('GD-PR4a — classifyTheme', () => {
  it('returns APOCRYPHA when no IGDB tag matches any rule', () => {
    expect(classifyTheme([])).toBe('APOCRYPHA');
    expect(classifyTheme(['Erotic'])).toBe('APOCRYPHA');
  });

  it('returns the cluster for a single matching tag', () => {
    expect(classifyTheme(['Horror'])).toBe('DREAD');
    expect(classifyTheme(['Fantasy'])).toBe('REALM');
    expect(classifyTheme(['Science fiction'])).toBe('COSMOS');
  });

  it('honours priority order — DREAD beats CHAOS when both present', () => {
    // Horror is in DREAD's matches; Action is in CHAOS's matches. DREAD
    // comes first in THEME_RULES so it wins.
    expect(classifyTheme(['Horror', 'Action'])).toBe('DREAD');
  });

  it('absorbs adjacent themes into the same cluster', () => {
    expect(classifyTheme(['Stealth'])).toBe('DREAD');
    expect(classifyTheme(['Sandbox'])).toBe('CHAOS');
    expect(classifyTheme(['Historical'])).toBe('AGES');
  });
});

describe('GD-PR4a — classifyPerspective', () => {
  it('returns SHROUD when no IGDB tag matches a known perspective', () => {
    expect(classifyPerspective([])).toBe('SHROUD');
    expect(classifyPerspective(['Unknown perspective'])).toBe('SHROUD');
  });

  it('returns the first known perspective from the tag list (IGDB orders by relevance)', () => {
    expect(classifyPerspective(['First person'])).toBe('First person');
    expect(classifyPerspective(['Third person', 'First person'])).toBe('Third person');
  });

  it('skips unknown values + returns the first known', () => {
    expect(classifyPerspective(['Unknown', 'Side view'])).toBe('Side view');
  });
});

describe('GD-PR4a — assignSigils', () => {
  it('always returns exactly 3 entries (GENRE / THEME / PERSPECTIVE)', () => {
    const result = assignSigils([], [], []);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.dimension)).toEqual(['GENRE', 'THEME', 'PERSPECTIVE']);
  });

  it('maps cluster names to sigil names via the locked tables', () => {
    const result = assignSigils(
      ['Role-playing (RPG)'],
      ['Horror'],
      ['First person'],
    );
    expect(result[0]).toEqual({ dimension: 'GENRE', value: 'QUEST', sigilName: GENRE_SIGIL.QUEST });
    expect(result[1]).toEqual({ dimension: 'THEME', value: 'DREAD', sigilName: THEME_SIGIL.DREAD });
    expect(result[2]).toEqual({ dimension: 'PERSPECTIVE', value: 'First person', sigilName: PERSPECTIVE_SIGIL['First person'] });
  });

  it('uses fallback sigils when classifier returns the fallback cluster', () => {
    const result = assignSigils([], [], []);
    expect(result[0]).toEqual({ dimension: 'GENRE', value: 'ASYLUM', sigilName: GENRE_SIGIL.ASYLUM });
    expect(result[1]).toEqual({ dimension: 'THEME', value: 'APOCRYPHA', sigilName: THEME_SIGIL.APOCRYPHA });
    expect(result[2]).toEqual({ dimension: 'PERSPECTIVE', value: 'SHROUD', sigilName: PERSPECTIVE_SIGIL.SHROUD });
  });

  it('every sigil name is a non-empty string (no missing entries in the sigil tables)', () => {
    const sample = assignSigils(['Music'], ['Comedy'], ['Bird view / Isometric']);
    for (const a of sample) {
      expect(typeof a.sigilName).toBe('string');
      expect(a.sigilName.length).toBeGreaterThan(0);
    }
  });
});

describe('GD-PR4a — sigil tables coverage (1 sigil = 1 value globally)', () => {
  it('no two dimensions share the same sigil name (consecrated-symbol interpretation)', () => {
    const allSigils = new Set<string>();
    const dupes: string[] = [];
    for (const v of Object.values(GENRE_SIGIL)) {
      if (allSigils.has(v)) dupes.push(v);
      allSigils.add(v);
    }
    for (const v of Object.values(THEME_SIGIL)) {
      if (allSigils.has(v)) dupes.push(v);
      allSigils.add(v);
    }
    for (const v of Object.values(PERSPECTIVE_SIGIL)) {
      if (allSigils.has(v)) dupes.push(v);
      allSigils.add(v);
    }
    expect(dupes).toEqual([]);
    // 8 GENRE + 8 THEME + 8 PERSPECTIVE = 24 unique sigils
    expect(allSigils.size).toBe(24);
  });
});
