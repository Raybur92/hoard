/**
 * OQ-GD-13 — full relic composition mockup.
 *
 * Locked in earlier iterations:
 *   - SOURCE: IGDB artwork (landscape 16:9), not cover (has logo / title)
 *   - METHOD: halftone, aligned grid, density r0.50 (tangent — dots
 *     touch their cardinal neighbours but don't overlap)
 *   - ASPECT: artwork is landscape; cover-fallback stays portrait
 *
 * Composition layers (top → bottom), per the moodboard:
 *   1. Industrial label band — REF / BASE MATERIAL / SEALED date /
 *      mini barcode (image 3 vocabulary)
 *   2. Halftone-dithered artwork centerpiece (640×360 SVG)
 *   3. Sigil stack — 3 small geometric marks chosen deterministically
 *      from a 12-mark placeholder vocabulary (image 4 + 5 territory)
 *   4. Inscribed receipt — title + sealed by + playtime + sub-status +
 *      rating + notes excerpt (extends Hoard's existing share-receipt)
 *   5. Barcode footer + relic ref#
 *
 * Mock metadata is hand-crafted per game so the layout reads with
 * plausible numbers. When the real implementation lands, these values
 * pull from UserGame + Game.
 *
 * Run: `npx tsx scripts/relic-composition.ts`. Output: relic-composition.html.
 */

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

/* ── halftone primitives (from relic-halftone.ts) ── */

const ART_COLS = 120;
const ART_ROWS = 68;
const ART_CELL = 6;
const HALFTONE_DENSITY = 0.50;

interface CellLuma { x: number; y: number; L: number }

async function readCellLuminance(url: string, cols: number, rows: number): Promise<CellLuma[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { data, info } = await sharp(buf)
    .resize(cols, rows, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cells: CellLuma[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * info.channels;
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      cells.push({ x, y, L });
    }
  }
  return cells;
}

function renderHalftone(cells: CellLuma[], cols: number, rows: number, cell: number, density: number): string {
  const w = cols * cell, h = rows * cell;
  const maxR = cell * density;
  const skip = cell * 0.05;
  let dots = '';
  for (const c of cells) {
    const t = c.L / 255;
    const r = maxR * t;
    if (r < skip) continue;
    const cx = c.x * cell + cell / 2;
    const cy = c.y * cell + cell / 2;
    dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(2)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
    <rect x="0" y="0" width="${w}" height="${h}" fill="#07090a"/>
    <g fill="#ece8de">${dots}</g>
  </svg>`;
}

/* ── shape-dither (full svg-dither-filter method) ── */

const SHAPE_BUCKETS = 7;

function shapeForBucket(bucket: number, cx: number, cy: number, s: number): string {
  switch (bucket) {
    case 0: return '';
    case 1: return `<circle cx="${cx}" cy="${cy}" r="${(s * 0.12).toFixed(2)}"/>`;
    case 2: {
      const armLen = s * 0.65, armW = s * 0.15;
      const x1 = cx - armLen / 2, y1 = cy - armW / 2;
      const x2 = cx - armW / 2, y2 = cy - armLen / 2;
      return `<rect x="${x1.toFixed(1)}" y="${y1.toFixed(1)}" width="${armLen.toFixed(1)}" height="${armW.toFixed(1)}"/><rect x="${x2.toFixed(1)}" y="${y2.toFixed(1)}" width="${armW.toFixed(1)}" height="${armLen.toFixed(1)}"/>`;
    }
    case 3: {
      const r = s * 0.35;
      return `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="none" stroke="#ece8de" stroke-width="${(s * 0.18).toFixed(2)}"/>`;
    }
    case 4: {
      const r = s * 0.45;
      return `<polygon points="${cx},${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)},${cy} ${cx},${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)},${cy}"/>`;
    }
    case 5: return `<circle cx="${cx}" cy="${cy}" r="${(s * 0.42).toFixed(2)}"/>`;
    case 6:
    default: {
      const a = s * 0.85;
      return `<rect x="${(cx - a / 2).toFixed(2)}" y="${(cy - a / 2).toFixed(2)}" width="${a.toFixed(2)}" height="${a.toFixed(2)}"/>`;
    }
  }
}

function luminanceToShapeBucket(L: number): number {
  return Math.min(SHAPE_BUCKETS - 1, Math.max(0, Math.floor((L * SHAPE_BUCKETS) / 256)));
}

function renderShapeDither(cells: CellLuma[], cols: number, rows: number, cell: number): string {
  const w = cols * cell, h = rows * cell;
  let marks = '';
  for (const c of cells) {
    const bucket = luminanceToShapeBucket(c.L);
    if (bucket === 0) continue;
    const cx = c.x * cell + cell / 2;
    const cy = c.y * cell + cell / 2;
    marks += shapeForBucket(bucket, cx, cy, cell);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
    <rect x="0" y="0" width="${w}" height="${h}" fill="#07090a"/>
    <g fill="#ece8de">${marks}</g>
  </svg>`;
}

/* ── sigil vocabulary (placeholder ~12 marks) ── */

interface Sigil { name: string; svg: string }

const SIGILS: Sigil[] = [
  /* ── core 16 (from previous iterations) ── */
  { name: 'orb',        svg: `<circle cx="20" cy="20" r="9" fill="#ece8de"/>` },
  { name: 'ring·dot',   svg: `<circle cx="20" cy="20" r="10" fill="none" stroke="#ece8de" stroke-width="1.5"/><circle cx="20" cy="20" r="2.5" fill="#ece8de"/>` },
  { name: 'star-8',     svg: (() => {
    const pts: string[] = [];
    for (let i = 0; i < 16; i++) {
      const r = i % 2 === 0 ? 12 : 5;
      const a = (i * Math.PI) / 8 - Math.PI / 2;
      pts.push(`${(20 + r * Math.cos(a)).toFixed(2)},${(20 + r * Math.sin(a)).toFixed(2)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="#ece8de"/>`;
  })() },
  { name: 'asterisk-6', svg: (() => {
    let lines = '';
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 6;
      const x = 20 + 11 * Math.cos(a);
      const y = 20 + 11 * Math.sin(a);
      lines += `<line x1="${(40 - x).toFixed(2)}" y1="${(40 - y).toFixed(2)}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="#ece8de" stroke-width="1.5"/>`;
    }
    return lines;
  })() },
  { name: 'cross',    svg: `<rect x="9" y="18" width="22" height="4" fill="#ece8de"/><rect x="18" y="9" width="4" height="22" fill="#ece8de"/>` },
  { name: 'block',    svg: `<rect x="10" y="10" width="20" height="20" fill="#ece8de"/>` },
  { name: 'box',      svg: `<rect x="10" y="10" width="20" height="20" fill="none" stroke="#ece8de" stroke-width="1.5"/>` },
  { name: 'diamond',  svg: `<polygon points="20,8 32,20 20,32 8,20" fill="#ece8de"/>` },
  { name: 'rings',    svg: `<circle cx="20" cy="20" r="13" fill="none" stroke="#ece8de" stroke-width="1"/><circle cx="20" cy="20" r="8" fill="none" stroke="#ece8de" stroke-width="1"/><circle cx="20" cy="20" r="3" fill="#ece8de"/>` },
  { name: 'cluster',  svg: (() => {
    let dots = '';
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
      dots += `<rect x="${10 + x * 8}" y="${10 + y * 8}" width="4" height="4" fill="#ece8de"/>`;
    }
    return dots;
  })() },
  { name: 'wedge',  svg: `<polygon points="20,8 32,32 8,32" fill="#ece8de"/>` },
  { name: 'half',   svg: `<path d="M 8 20 a 12 12 0 0 1 24 0 z" fill="#ece8de"/>` },
  { name: 'spiral', svg: `<path d="M 20 20 m -1 0 a 1 1 0 1 1 2 0 a 2 2 0 1 1 -4 0 a 3 3 0 1 1 6 0 a 4 4 0 1 1 -8 0 a 6 6 0 1 1 12 0" fill="none" stroke="#ece8de" stroke-width="1.4"/>` },
  { name: 'ladder', svg: `<rect x="10" y="11" width="20" height="2.5" fill="#ece8de"/><rect x="10" y="18.75" width="20" height="2.5" fill="#ece8de"/><rect x="10" y="26.5" width="20" height="2.5" fill="#ece8de"/>` },
  { name: 'sunburst', svg: (() => {
    let lines = '';
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const x1 = 20 + 5 * Math.cos(a);
      const y1 = 20 + 5 * Math.sin(a);
      const x2 = 20 + 13 * Math.cos(a);
      const y2 = 20 + 13 * Math.sin(a);
      lines += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#ece8de" stroke-width="1.4"/>`;
    }
    return lines + `<circle cx="20" cy="20" r="2" fill="#ece8de"/>`;
  })() },
  { name: 'target', svg: `<circle cx="20" cy="20" r="12" fill="none" stroke="#ece8de" stroke-width="1"/><circle cx="20" cy="20" r="6" fill="none" stroke="#ece8de" stroke-width="1"/><line x1="6" y1="20" x2="34" y2="20" stroke="#ece8de" stroke-width="0.8"/><line x1="20" y1="6" x2="20" y2="34" stroke="#ece8de" stroke-width="0.8"/>` },
  /* ── 8 new marks (added 2026-06-01 to cover the full 3-dim system) ── */
  // wave — three sine ridges (music / sound)
  { name: 'wave', svg: `<path d="M 6 20 q 4 -8 8 0 t 8 0 t 8 0 t 8 0" fill="none" stroke="#ece8de" stroke-width="1.6"/>` },
  // flame — asymmetric curved triangle (chaos / action / untamed)
  { name: 'flame', svg: `<path d="M 20 8 q -6 6 -4 14 q -2 4 4 10 q 6 -6 4 -10 q 2 -8 -4 -14 z" fill="#ece8de"/>` },
  // eye — almond + iris (dread / surveillance)
  { name: 'eye', svg: `<path d="M 6 20 q 14 -10 28 0 q -14 10 -28 0 z" fill="none" stroke="#ece8de" stroke-width="1.4"/><circle cx="20" cy="20" r="3.5" fill="#ece8de"/>` },
  // stairs — three-step pyramid (narrative ascent / prose)
  { name: 'stairs', svg: `<rect x="6" y="26" width="28" height="4" fill="#ece8de"/><rect x="11" y="20" width="18" height="4" fill="#ece8de"/><rect x="16" y="14" width="8" height="4" fill="#ece8de"/>` },
  // hex — hexagon outline with center dot (ancient / cellular)
  { name: 'hex', svg: `<polygon points="20,7 31,13 31,27 20,33 9,27 9,13" fill="none" stroke="#ece8de" stroke-width="1.4"/><circle cx="20" cy="20" r="1.5" fill="#ece8de"/>` },
  // trefoil — three petals (fantasy / realm)
  { name: 'trefoil', svg: `<circle cx="20" cy="13" r="6" fill="none" stroke="#ece8de" stroke-width="1.4"/><circle cx="14" cy="24" r="6" fill="none" stroke="#ece8de" stroke-width="1.4"/><circle cx="26" cy="24" r="6" fill="none" stroke="#ece8de" stroke-width="1.4"/>` },
  // orbit — center + elliptical orbit ring (cosmos / sci-fi)
  { name: 'orbit', svg: `<ellipse cx="20" cy="20" rx="13" ry="5" fill="none" stroke="#ece8de" stroke-width="1.2" transform="rotate(-25 20 20)"/><circle cx="20" cy="20" r="3" fill="#ece8de"/>` },
  // cube-iso — isometric cube (third-person depth)
  { name: 'cube-iso', svg: `<polygon points="20,8 32,15 32,28 20,35 8,28 8,15" fill="none" stroke="#ece8de" stroke-width="1.2"/><line x1="20" y1="8" x2="20" y2="35" stroke="#ece8de" stroke-width="1.2"/><line x1="8" y1="15" x2="32" y2="15" stroke="#ece8de" stroke-width="1.2"/>` },
];

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const SIGIL_BY_NAME: Record<string, Sigil> = Object.fromEntries(SIGILS.map((s) => [s.name, s]));

/* ──────────────────────────────────────────────────────────────────
 * Three-dimension sigil system (locked 2026-06-01).
 *
 * Each sigil maps to EXACTLY ONE value across the entire system — the
 * pure consecrated-symbol interpretation. Reader builds a vocabulary
 * over time. 24 sigils, 24 mapped values:
 *   - 8 GENRE super-categories (7 + ASYLUM fallback)
 *   - 8 THEME super-categories (7 + APOCRYPHA fallback)
 *   - 8 PERSPECTIVE values (7 IGDB perspectives + SHROUD fallback)
 *
 * Classifier functions consume a game's IGDB tag arrays (genres[] /
 * themes[] / playerPerspectives[]) and return the dominant super-cat
 * via a priority order. The priority order prefers MORE SPECIFIC
 * tags over BROADER ones (Platform beats Adventure for genre;
 * Horror beats Action for theme).
 * ────────────────────────────────────────────────────────────────── */

/* ── GENRE clusters (7 + fallback ASYLUM) ── */
//
// IGDB genres absorbed:
//   QUEST    — RPG · Adventure · Visual Novel · Point-and-click
//   COMBAT   — Fighting · Hack & Slash · Shooter · Arcade
//   STRATEGY — RTS · TBS · Strategy · Tactical · MOBA
//   JUMP     — Platform
//   MIND     — Puzzle · Quiz/Trivia · Card & Board Game
//   CIRCUIT  — Simulator · Sport · Racing · Pinball
//   MUSIC    — Music
//   ASYLUM   — Indie only / no recognised genres
const GENRE_RULES: Array<{ cluster: string; matches: string[] }> = [
  { cluster: 'MUSIC',    matches: ['Music'] },
  { cluster: 'CIRCUIT',  matches: ['Simulator', 'Sport', 'Racing', 'Pinball'] },
  { cluster: 'JUMP',     matches: ['Platform'] },
  { cluster: 'STRATEGY', matches: ['Real Time Strategy (RTS)', 'Turn-based strategy (TBS)', 'Strategy', 'Tactical', 'MOBA'] },
  { cluster: 'MIND',     matches: ['Puzzle', 'Quiz/Trivia', 'Card & Board Game'] },
  { cluster: 'COMBAT',   matches: ['Fighting', 'Hack and slash/Beat \'em up', 'Shooter', 'Arcade'] },
  { cluster: 'QUEST',    matches: ['Role-playing (RPG)', 'Adventure', 'Visual Novel', 'Point-and-click'] },
];
const GENRE_SIGIL: Record<string, string> = {
  QUEST:    'star-8',   // compass / many directions
  COMBAT:   'cross',    // blade / duel
  STRATEGY: 'target',   // commanding view
  JUMP:     'wedge',    // rising
  MIND:     'cluster',  // puzzle cells
  CIRCUIT:  'rings',    // mechanical loop
  MUSIC:    'wave',     // sound
  ASYLUM:   'half',     // mystery / partial reveal
};

/* ── THEME clusters (7 + fallback APOCRYPHA) ── */
const THEME_RULES: Array<{ cluster: string; matches: string[] }> = [
  { cluster: 'DREAD',  matches: ['Horror', 'Thriller', 'Survival', 'Stealth'] },
  { cluster: 'REALM',  matches: ['Fantasy'] },
  { cluster: 'COSMOS', matches: ['Science fiction', '4X (explore, expand, exploit, and exterminate)'] },
  { cluster: 'PROSE',  matches: ['Drama', 'Mystery', 'Non-fiction', 'Romance'] },
  { cluster: 'MIRTH',  matches: ['Comedy', 'Party', 'Kids'] },
  { cluster: 'AGES',   matches: ['Historical', 'Educational', 'Business'] },
  { cluster: 'CHAOS',  matches: ['Action', 'Sandbox', 'Open world', 'Warfare'] },
];
const THEME_SIGIL: Record<string, string> = {
  REALM:     'trefoil',     // fantasy
  COSMOS:    'orbit',       // sci-fi / planets
  DREAD:     'eye',         // watching / horror
  MIRTH:     'sunburst',    // radiance / comedy
  PROSE:     'stairs',      // narrative ascent
  AGES:      'hex',         // ancient / cellular
  CHAOS:     'flame',       // untamed action
  APOCRYPHA: 'asterisk-6',  // scattered / unclassifiable
};

/* ── PERSPECTIVES (direct mapping — small enough vocab, no clustering) ── */
const PERSPECTIVE_SIGIL: Record<string, string> = {
  'First person':           'ring·dot',  // eye-view
  'Third person':           'cube-iso',  // 3D depth
  'Bird view / Isometric':  'box',       // tile-grid overview
  'Side view':              'ladder',    // horizontal levels
  'Text':                   'block',     // page / paragraph
  'Auditory':               'diamond',   // sound-faceted
  'Virtual Reality':        'orb',       // immersive sphere
  'SHROUD':                 'spiral',    // perspective unknown / unclassified
};

/* ── Classifiers ── */

function classifyGenre(tags: string[]): string {
  for (const r of GENRE_RULES) if (tags.some((t) => r.matches.includes(t))) return r.cluster;
  return 'ASYLUM';
}
function classifyTheme(tags: string[]): string {
  for (const r of THEME_RULES) if (tags.some((t) => r.matches.includes(t))) return r.cluster;
  return 'APOCRYPHA';
}
function classifyPerspective(tags: string[]): string {
  // Use the first recognised perspective (IGDB usually orders by relevance).
  for (const t of tags) if (PERSPECTIVE_SIGIL[t]) return t;
  return 'SHROUD';
}

interface SigilAssignment { sigil: Sigil; dimension: string; value: string }

function assignSigils(c: Candidate): SigilAssignment[] {
  const genre = classifyGenre(c.igdbGenres);
  const theme = classifyTheme(c.igdbThemes);
  const perspective = classifyPerspective(c.igdbPerspectives);
  return [
    { dimension: 'GENRE',       value: genre,       sigil: SIGIL_BY_NAME[GENRE_SIGIL[genre] ?? 'half']! },
    { dimension: 'THEME',       value: theme,       sigil: SIGIL_BY_NAME[THEME_SIGIL[theme] ?? 'asterisk-6']! },
    { dimension: 'PERSPECTIVE', value: perspective, sigil: SIGIL_BY_NAME[PERSPECTIVE_SIGIL[perspective] ?? 'spiral']! },
  ];
}

function relicRef(igdbId: number, completedAt: string): string {
  const h = fnv1a(`${igdbId}:${completedAt}`);
  // Base-36, take 6 chars, format XXX-XXX
  const s = h.toString(36).toUpperCase().padStart(8, '0');
  return `${s.slice(0, 3)}-${s.slice(3, 7)}`;
}

/* ── mock candidates (with completion metadata) ── */

interface Candidate {
  title: string;
  igdbId: number;
  coverUrl: string;
  artworkUrl: string;
  developer: string;
  releaseYear: number;
  // IGDB-shape tag arrays — drive the three sigil dimensions via the
  // classifier functions. Values use IGDB's canonical strings so the
  // classifier rules match.
  igdbGenres: string[];
  igdbThemes: string[];
  igdbPerspectives: string[];
  platform: string;        // still shown in the title-lockup byline
  completedAt: string;
  playtimeMin: number;
  subStatus: 'main' | '+side' | '100%';
  rating: number;
  notes: string;
}

const candidates: Candidate[] = [
  { title: 'Cyberpunk 2077',                igdbId: 1877,   coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/coaih8.jpg', artworkUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/ar3m0k.jpg', developer: 'CD PROJEKT RED',       releaseYear: 2020, igdbGenres: ['Shooter', 'Role-playing (RPG)', 'Adventure'],          igdbThemes: ['Action', 'Science fiction', 'Open world'],   igdbPerspectives: ['First person', 'Third person'], platform: 'PS5', completedAt: '2026-01-22', playtimeMin: 91 * 60,  subStatus: 'main',  rating: 7,  notes: 'phantom liberty was the patch this needed.' },
  { title: 'The Witcher 3: Wild Hunt',      igdbId: 1942,   coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/coaarl.jpg', artworkUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/ar3lzn.jpg', developer: 'CD PROJEKT RED',       releaseYear: 2015, igdbGenres: ['Role-playing (RPG)', 'Adventure'],                     igdbThemes: ['Action', 'Fantasy', 'Open world'],            igdbPerspectives: ['Third person'],                  platform: 'PS5', completedAt: '2024-03-10', playtimeMin: 124 * 60, subStatus: '100%',  rating: 10, notes: 'every gwent deck completed. yennefer ending.' },
  { title: 'Disco Elysium',                 igdbId: 26472,  coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1sfj.jpg', artworkUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/ar4m5.jpg',  developer: 'ZA/UM',                releaseYear: 2019, igdbGenres: ['Role-playing (RPG)', 'Adventure', 'Indie'],            igdbThemes: ['Thriller', 'Drama', 'Mystery'],               igdbPerspectives: ['Bird view / Isometric', 'Text'], platform: 'PC',  completedAt: '2025-06-30', playtimeMin: 38 * 60,  subStatus: 'main',  rating: 9,  notes: 'sorry cop. genuine sorry cop.' },
  { title: 'Control',                       igdbId: 136604, coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2ewb.jpg', artworkUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/ar7cx.jpg',  developer: 'Remedy Entertainment', releaseYear: 2020, igdbGenres: ['Shooter', 'Adventure'],                                igdbThemes: ['Action', 'Science fiction', 'Mystery'],      igdbPerspectives: ['Third person'],                  platform: 'PS5', completedAt: '2025-08-14', playtimeMin: 22 * 60,  subStatus: '+side', rating: 8,  notes: 'the oldest house has questions. fewer answers.' },
  { title: 'Alan Wake II',                  igdbId: 185246, coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co6jar.jpg', artworkUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/ar3nui.jpg', developer: 'Remedy Entertainment', releaseYear: 2023, igdbGenres: ['Shooter', 'Adventure'],                                igdbThemes: ['Horror', 'Thriller', 'Mystery', 'Drama'],     igdbPerspectives: ['Third person'],                  platform: 'PC',  completedAt: '2026-03-08', playtimeMin: 28 * 60,  subStatus: 'main',  rating: 9,  notes: "the dark place. it's a song. it's a song." },
  { title: 'Starfield',                     igdbId: 96437,  coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co39vv.jpg', artworkUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/ar91m.jpg',  developer: 'Bethesda Game Studios',releaseYear: 2023, igdbGenres: ['Shooter', 'Role-playing (RPG)', 'Adventure'],          igdbThemes: ['Action', 'Science fiction', 'Sandbox', 'Open world'], igdbPerspectives: ['First person', 'Third person'], platform: 'PC', completedAt: '2024-11-20', playtimeMin: 67 * 60,  subStatus: 'main',  rating: 7,  notes: '1000 planets. mostly empty. but some sing.' },
  { title: 'Death Stranding',               igdbId: 19564,  coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/cobksf.jpg', artworkUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/ar3s0u.jpg', developer: 'Kojima Productions',   releaseYear: 2019, igdbGenres: ['Shooter', 'Role-playing (RPG)', 'Adventure'],          igdbThemes: ['Action', 'Science fiction', 'Survival', 'Stealth', 'Open world'], igdbPerspectives: ['Third person'], platform: 'PS5', completedAt: '2025-04-02', playtimeMin: 56 * 60,  subStatus: '+side', rating: 9,  notes: 'kept all the chiral connections strong. very strands.' },
  { title: 'Kingdom Come: Deliverance II',  igdbId: 298526, coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co8qmv.jpg', artworkUrl: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/ar3s9k.jpg', developer: 'Warhorse Studios',     releaseYear: 2025, igdbGenres: ['Role-playing (RPG)', 'Simulator', 'Adventure'],        igdbThemes: ['Historical', 'Drama'],                        igdbPerspectives: ['First person', 'Third person'], platform: 'PC', completedAt: '2026-04-15', playtimeMin: 84 * 60,  subStatus: '+side', rating: 9,  notes: "henry, your luck is renowned. but i'm renouncing alchemy." },
];

/* ── helpers ── */

function fmtPlaytime(min: number): string {
  return `${Math.floor(min / 60)}h ${min % 60 ? `${min % 60}m` : ''}`.trim();
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }).toUpperCase();
}

/* ── relic SVG composition ── */

interface BuiltRelic {
  title: string;
  refCode: string;
  artworkSvg: string;
  sigilAssignments: SigilAssignment[];
  meta: Candidate;
}

async function buildRelic(c: Candidate): Promise<BuiltRelic> {
  const cells = await readCellLuminance(c.artworkUrl, ART_COLS, ART_ROWS);
  // shape-dither (full svg-dither-filter method, no rotation) — Andrea
  // wants to A/B this against the halftone variant in the full
  // composition. Halftone version preserved in relic-composition-v1.html.
  const artworkSvg = renderShapeDither(cells, ART_COLS, ART_ROWS, ART_CELL);
  return {
    title: c.title,
    refCode: relicRef(c.igdbId, c.completedAt),
    artworkSvg,
    sigilAssignments: assignSigils(c),
    meta: c,
  };
}

/* ── HTML render ── */

/* ── micro-barcode SVG that fills its container vertically ── */

/*
 * Code128-inspired barcode (looks like a real shipping-label barcode).
 *
 * Real Code128 encodes each character as 11 modules consisting of 3
 * bars + 3 gaps, each 1-4 modules wide. We borrow that rhythm with a
 * small library of 12 character patterns; the ref-code hash picks
 * which to concatenate. Wraps with the canonical Code128 start
 * pattern (211412) and end pattern (2331112) so the overall shape
 * reads as a scannable code even though the encoding is decorative.
 *
 * Each character is `[barW, gapW, barW, gapW, barW, gapW]` in modules.
 */
const CODE128_START = [2, 1, 1, 4, 1, 2];
const CODE128_STOP  = [2, 3, 3, 1, 1, 1, 2];
const CODE128_CHARS: number[][] = [
  [2, 1, 2, 2, 2, 2], // mid
  [2, 2, 2, 1, 2, 2], // mid
  [2, 2, 2, 2, 2, 1],
  [1, 2, 1, 2, 2, 3], // wide bar at end
  [1, 2, 1, 3, 2, 2],
  [1, 3, 1, 2, 2, 2],
  [1, 2, 2, 2, 1, 3],
  [1, 2, 2, 3, 1, 2],
  [1, 3, 2, 2, 1, 2],
  [2, 2, 1, 2, 1, 3],
  [2, 2, 1, 3, 1, 2],
  [2, 3, 1, 2, 1, 2],
];

function microBarcode(refCode: string, totalWidth: number, height: number): string {
  // Build the bar sequence (start → 4-8 chars → stop) seeded by ref.
  const seed = fnv1a(refCode);
  const charCount = 5 + (seed % 4); // 5..8 characters
  const seq: number[] = [...CODE128_START];
  let rng = seed;
  for (let i = 0; i < charCount; i++) {
    rng = (rng * 1103515245 + 12345) >>> 0;
    seq.push(...CODE128_CHARS[rng % CODE128_CHARS.length]!);
  }
  seq.push(...CODE128_STOP);

  // Total modules = sum of all widths. Module width = totalWidth / totalModules.
  const totalModules = seq.reduce((s, m) => s + m, 0);
  const moduleW = totalWidth / totalModules;

  let bars = '';
  let x = 0;
  let isBar = true; // sequence alternates bar / gap starting with bar
  for (const modules of seq) {
    const w = modules * moduleW;
    // Muted bars (paper-faint #6b6f72) instead of full paper #ece8de so
    // the barcode reads as a calm shipping-label texture rather than a
    // high-contrast graphic element. Per Andrea's eyeball 2026-06-01.
    if (isBar) bars += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="#6b6f72"/>`;
    x += w;
    isBar = !isBar;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" width="${totalWidth}" height="${height}" preserveAspectRatio="none">${bars}</svg>`;
}

type BottomVariant = 'barcode' | 'cartouche' | 'sigil-seal' | 'motto' | 'punchcard';

/* ── Roman numeral helper for cartouche / motto variants ── */
function toRoman(n: number): string {
  const map: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let r = '';
  let v = n;
  for (const [k, s] of map) { while (v >= k) { r += s; v -= k; } }
  return r;
}

/* ── motto picker: dog-Latin phrase keyed off sub-status ── */
function pickMotto(subStatus: string): string {
  if (subStatus === '100%') return '· PER · OMNIA · SAECVLA · SIGILLATVS ·';
  if (subStatus === '+side') return '· OMNIA · EXPLORATA · ARCHIVATA ·';
  return '· EX · LVDO · COMPLETO · IN · AETERNVM ·';
}

/* ── punchcard renderer: deterministic 24-cell data-tape from refCode ── */
function renderPunchCard(refCode: string): string {
  const seed = fnv1a(refCode + ':punch');
  let rng = seed;
  const cells: string[] = [];
  for (let i = 0; i < 24; i++) {
    rng = (rng * 1103515245 + 12345) >>> 0;
    // weighted ~55% filled → readable rhythm with frequent gaps
    const filled = (rng % 100) < 55;
    cells.push(filled
      ? '<span class="pc-cell pc-on"></span>'
      : '<span class="pc-cell pc-off"></span>');
  }
  return cells.join('');
}

function renderBottomBand(r: BuiltRelic, variant: BottomVariant): string {
  const m = r.meta;
  const year = m.releaseYear; // year-of-release for cartouche subtitle; could swap to completedAt year
  const completedYear = parseInt(m.completedAt.slice(0, 4), 10);
  if (variant === 'barcode') {
    return `
      <div class="band band-bottom band-barcode">
        ${microBarcode(r.refCode + ':footer', 360, 24)}
        <span class="footer-meta">RELIC ${r.refCode} · CONSECRATED ${fmtDate(m.completedAt)}</span>
      </div>`;
  }
  if (variant === 'cartouche') {
    // Permanent stamp — archive signature + consecration motto + the
    // three assigned sigils (genre / theme / perspective clusters) as a
    // small row of glyphs underneath. Sigils are bare (no chips) so they
    // read as part of the inscription rather than as iconography.
    return `
      <div class="band band-bottom band-cartouche">
        <div class="cart-line">
          <span class="cart-rule"></span>
          <span class="cart-text">HOARD ARCHIVE</span>
          <span class="cart-rule"></span>
        </div>
        <div class="cart-sub">· IN AETERNVM · ${toRoman(completedYear)} ·</div>
        <div class="cart-sigils" aria-label="Sigil stack">
          ${r.sigilAssignments.map((a) => `
            <svg viewBox="0 0 40 40" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-label="${a.dimension} · ${a.value}"><title>${a.dimension}: ${a.value}</title>${a.sigil.svg}</svg>
          `).join('')}
        </div>
      </div>`;
  }
  if (variant === 'sigil-seal') {
    // Consecration sigil row — the 3 sigil assignments enlarged with their
    // cluster names underneath. Doubles as a visual "this is what made the
    // relic" summary.
    return `
      <div class="band band-bottom band-sigil-seal">
        <div class="seal-rule"></div>
        <div class="seal-row">
          ${r.sigilAssignments.map((a) => `
            <div class="seal-cell">
              <svg viewBox="0 0 40 40" width="34" height="34" xmlns="http://www.w3.org/2000/svg"><title>${a.dimension}: ${a.value}</title>${a.sigil.svg}</svg>
              <div class="seal-name">${a.value}</div>
            </div>
          `).join('')}
        </div>
        <div class="seal-caption">SEAL OF COMPLETION</div>
      </div>`;
  }
  if (variant === 'motto') {
    // Latin motto plate. Picks phrase by sub-status so the message has
    // some grain across the collection rather than reading the same.
    return `
      <div class="band band-bottom band-motto">
        <div class="motto-rule">⋅ ⋅ ⋅</div>
        <div class="motto-line">${pickMotto(m.subStatus)}</div>
        <div class="motto-sub">${toRoman(completedYear)}</div>
        <div class="motto-rule">⋅ ⋅ ⋅</div>
      </div>`;
  }
  // punchcard
  // 24-cell data tape, deterministically generated from refCode. Sub-labels
  // surface the engagement signals (playtime / sub-status / rating).
  return `
    <div class="band band-bottom band-punchcard">
      <div class="punch-row" aria-hidden="true">${renderPunchCard(r.refCode)}</div>
      <div class="punch-sub">
        <span>${fmtPlaytime(m.playtimeMin)}</span>
        <span>·</span>
        <span>${m.subStatus.toUpperCase()}</span>
        <span>·</span>
        <span class="amber">★ ${m.rating}</span>
      </div>
    </div>`;
}

function renderRelicHtml(r: BuiltRelic, bottomVariant: BottomVariant = 'cartouche'): string {
  const m = r.meta;
  // Dotted-leader trick — provide enough dots that the flex span
  // overflows; CSS clips the excess so the dots fill the gap dynamically
  // regardless of how long the label / value strings are.
  const dotsRow = '·'.repeat(200);
  // Pull the classifier results so the band can show the super-cluster
  // name (which matches the sigil meaning).
  const genreCluster = classifyGenre(m.igdbGenres);
  return `
  <article class="relic">
    <!-- top label band (industrial / archival vocabulary, moodboard image 3) -->
    <div class="band band-top">
      <div class="cell"><span class="k">REF</span><span class="v">${r.refCode}</span></div>
      <div class="cell"><span class="k">BASE MATERIAL</span><span class="v">${genreCluster}</span></div>
      <div class="cell"><span class="k">SEALED</span><span class="v">${fmtDate(m.completedAt)}</span></div>
      <div class="cell barcode-cell" aria-hidden="true">${microBarcode(r.refCode, 90, 24)}</div>
    </div>

    <!-- artwork centerpiece (shape-dither) -->
    <div class="artwork">${r.artworkSvg}</div>

    <!-- title + run lockup -->
    <div class="lockup">
      <div class="title">${m.title.toUpperCase()}</div>
      <div class="byline">${m.developer.toLowerCase()} · ${m.releaseYear} · ${m.platform}</div>
    </div>

    <!-- inscribed receipt -->
    <div class="receipt">
      <div class="rline"><span class="k">TOTAL PLAYTIME</span><span class="dots">${dotsRow}</span><span class="v">${fmtPlaytime(m.playtimeMin)}</span></div>
      <div class="rline"><span class="k">SUB-STATUS</span><span class="dots">${dotsRow}</span><span class="v">${m.subStatus}</span></div>
      <div class="rline"><span class="k">RATING</span><span class="dots">${dotsRow}</span><span class="v amber">${m.rating}/10</span></div>
      <div class="rline note"><span class="k">NOTE</span><span class="ntext">${m.notes}</span></div>
    </div>

    <!-- bottom band — variant-driven (barcode / cartouche / sigil-seal / motto / punchcard) -->
    ${renderBottomBand(r, bottomVariant)}
  </article>`;
}

function renderVariantsHtml(relic: BuiltRelic, variants: BottomVariant[]): string {
  // Re-uses the composition shell by delegating to renderHtml-style markup,
  // but the .grid contains the same relic rendered N times with different
  // bottom bands. Each card carries a visible variant label.
  const composition = renderHtml([relic]);
  // Build the variant-grid markup
  const cards = variants.map((v) => `
    <section class="variant-cell">
      <div class="variant-label">// ${v}</div>
      ${renderRelicHtml(relic, v)}
    </section>
  `).join('\n');
  // Splice into the composition shell: replace the original grid (which has
  // 1 relic) with our variant grid + replace the h1 / meta-line copy so the
  // page identifies itself as the variant comparison.
  return composition
    .replace(
      /<h1>[\s\S]*?<\/h1>/,
      `<h1>// bottom band — variant comparison · ${relic.meta.title.toLowerCase()}</h1>`,
    )
    .replace(
      /<div class="meta-line">[\s\S]*?<\/div>/,
      `<div class="meta-line">OQ-GD-13 · same relic rendered ${variants.length} times with different bottom-band treatments · pick the one that holds up best</div>`,
    )
    .replace(
      /<div class="grid">[\s\S]*?<\/div>\s*<\/main>/,
      `<div class="vgrid">${cards}</div></main>`,
    )
    .replace(
      '</style>',
      `
      /* variant-comparison overrides */
      .vgrid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
        gap: 24px 20px;
        align-items: stretch;
      }
      .variant-cell {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .variant-label {
        color: var(--paper-faint);
        font-size: 10px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
    </style>`,
    );
}

function renderHtml(relics: BuiltRelic[]): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Hoard — Archivist Relic Composition (OQ-GD-13)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --void: #07090a; --ink: #0d1012; --ink-2: #14181b;
      --paper: #ece8de; --paper-dim: #a9a89e; --paper-faint: #6b6f72;
      --rule: #23292d; --rule-bright: #2d3439; --amber: #d4a017;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: var(--void); color: var(--paper); font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 13px; line-height: 1.5; }
    main { padding: 28px 32px 60px; max-width: 1800px; margin: 0 auto; }
    h1 { font-size: 16px; color: var(--amber); letter-spacing: 0.05em; margin: 0 0 4px; }
    .meta-line { color: var(--paper-faint); font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 10px; }
    .vocab-link { margin-bottom: 22px; }
    .vocab-link a { color: var(--amber); text-decoration: none; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; border-bottom: 1px solid var(--rule); padding-bottom: 1px; }
    .vocab-link a:hover { border-bottom-color: var(--amber); }
    /* Auto-fit grid — caps each card at ~360px wide; columns flow as
       viewport allows (4 across at 1600px+, 3 at 1200px, 2 at 800px, 1 below). */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 360px));
      gap: 20px;
      justify-content: start;
    }

    /* ── relic card ── */
    .relic {
      background: var(--ink);
      border: 1px solid var(--rule);
      padding: 0;
      display: flex;
      flex-direction: column;
      box-shadow: 0 12px 32px -8px rgba(0,0,0,0.5);
    }

    /* top + bottom industrial bands */
    .band {
      display: flex;
      align-items: stretch;
      border-bottom: 1px solid var(--rule);
      font-size: 9px;
      letter-spacing: 0.1em;
    }
    .band-top {
      background: var(--ink-2);
      align-items: stretch; /* children stretch to full band height */
    }
    .band-top .cell {
      flex: 1;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      border-right: 1px solid var(--rule);
      min-width: 0;
    }
    .band-top .cell:last-child { border-right: none; }
    /* Barcode cell — fixed width, uniform 6px margin around the SVG so
       the bars don't run flush to the cell edges. Background drops to
       --ink (card body) so the barcode reads as a "die-cut" hole in
       the otherwise raised --ink-2 label band. Muted bar colour
       completes the calm shipping-label texture. */
    .band-top .barcode-cell {
      flex: 0 0 auto;
      padding: 8px;
      background: var(--ink);
      display: flex;
      align-items: stretch;
    }
    .band-top .barcode-cell svg {
      display: block;
      height: 100%;
      width: 56px;
    }
    .band-top .k { color: var(--paper-faint); font-size: 7px; letter-spacing: 0.18em; text-transform: uppercase; }
    .band-top .v { color: var(--paper); font-size: 9px; letter-spacing: 0.1em; word-break: break-word; overflow-wrap: anywhere; line-height: 1.25; }

    /* artwork centerpiece */
    .artwork {
      background: var(--void);
      border-bottom: 1px solid var(--rule);
      line-height: 0;
    }
    .artwork svg { display: block; width: 100%; height: auto; }

    /* (legacy) sigil row — kept for any out-of-tree consumers but no
       longer rendered in the composition page. */
    .sigils {
      display: flex;
      justify-content: center;
      align-items: flex-start;
      gap: 24px;
      padding: 14px 0 12px;
      border-bottom: 1px solid var(--rule);
    }
    .sigil-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      min-width: 64px;
    }
    .sigil-cell svg { display: block; width: 32px; height: 32px; }
    .sigil-cap {
      color: var(--paper-faint);
      font-size: 7px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      margin-top: 3px;
    }
    .sigil-val {
      color: var(--paper-dim);
      font-size: 8px;
      letter-spacing: 0.08em;
    }

    /* title lockup */
    .lockup {
      padding: 12px 18px 6px;
      text-align: center;
    }
    .lockup .title {
      font-size: 16px;
      letter-spacing: 0.04em;
      color: var(--paper);
      line-height: 1.1;
    }
    .lockup .byline {
      font-size: 8px;
      letter-spacing: 0.18em;
      color: var(--paper-faint);
      text-transform: uppercase;
      margin-top: 3px;
    }

    /* inscribed receipt — flex-grows so all cards in a row reach the
       same height (grid align-items: stretch). The notes section
       inside absorbs the vertical slack so the bottom barcode band
       sits at a constant height regardless of how short the notes are. */
    .receipt {
      padding: 10px 18px 16px;
      border-bottom: 1px solid var(--rule);
      font-size: 10px;
      color: var(--paper-dim);
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .rline {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding: 2px 0;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .rline .k { color: var(--paper-faint); font-size: 8px; flex: 0 0 auto; letter-spacing: 0.14em; }
    .rline .dots {
      /* min-width: 0 lets this flex child shrink BELOW its (very long)
         content size; overflow: hidden on this element clips the excess
         dots while the .v sibling stays visible on the right. */
      color: var(--rule-bright);
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      letter-spacing: 0.15em;
      font-size: 10px;
      align-self: center;
    }
    .rline .v { color: var(--paper); font-size: 10px; letter-spacing: 0.05em; flex: 0 0 auto; }
    .rline .v.amber { color: var(--amber); }
    .rline.note { display: flex; gap: 6px; align-items: flex-start; flex-direction: column; padding-top: 6px; border-top: 1px dashed var(--rule); margin-top: 6px; overflow: visible; flex: 1; }
    .rline.note .k { flex: 0 0 auto; }
    .ntext { color: var(--paper-dim); font-style: italic; letter-spacing: 0.02em; text-transform: none; font-size: 10px; line-height: 1.45; }

    /* bottom barcode — uses --ink (card body) bg + muted bars. The
       barcode SVG itself spans full width with uniform 6px margin
       around the band (top + left + right + gap before meta). The
       footer-meta sits centered below with its own bottom padding. */
    .band-bottom {
      background: var(--ink);
      padding: 6px 6px 8px;
      flex-direction: column;
      gap: 6px;
      border-bottom: none;
      align-items: stretch;
    }
    .band-bottom svg { width: 100%; height: 18px; display: block; }
    .band-barcode svg { width: 100%; height: 18px; display: block; }
    .footer-meta { color: var(--paper-faint); font-size: 7px; letter-spacing: 0.14em; text-transform: uppercase; text-align: center; }

    /* ── Variant: catalogue cartouche ── */
    .band-cartouche {
      background: var(--ink-2);
      padding: 10px 14px 12px;
      align-items: center;
      gap: 4px;
    }
    .cart-line {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
    }
    .cart-rule {
      flex: 1;
      height: 1px;
      background: var(--rule-bright);
    }
    .cart-text {
      color: var(--paper);
      font-size: 9px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      flex: 0 0 auto;
    }
    .cart-sub {
      color: var(--paper-faint);
      font-size: 7px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      text-align: center;
    }
    .cart-sigils {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 14px;
      margin-top: 2px;
    }

    /* ── Variant: consecration sigil row ── */
    .band-sigil-seal {
      background: var(--ink-2);
      padding: 10px 14px 12px;
      align-items: center;
      gap: 6px;
    }
    .seal-rule {
      width: 60%;
      height: 1px;
      background: var(--rule-bright);
    }
    .seal-row {
      display: flex;
      justify-content: center;
      gap: 22px;
      width: 100%;
    }
    .seal-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .seal-name {
      color: var(--paper-faint);
      font-size: 7px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .seal-caption {
      color: var(--paper-dim);
      font-size: 7px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      margin-top: 2px;
    }

    /* ── Variant: motto plate ── */
    .band-motto {
      background: var(--ink-2);
      padding: 10px 14px 12px;
      align-items: center;
      gap: 4px;
      text-align: center;
    }
    .motto-rule {
      color: var(--paper-faint);
      font-size: 8px;
      letter-spacing: 0.5em;
    }
    .motto-line {
      color: var(--paper);
      font-size: 10px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    .motto-sub {
      color: var(--paper-faint);
      font-size: 7px;
      letter-spacing: 0.3em;
    }

    /* ── Variant: punch-card data tape ── */
    .band-punchcard {
      background: var(--ink);
      padding: 10px 14px 12px;
      align-items: center;
      gap: 6px;
    }
    .punch-row {
      display: flex;
      gap: 3px;
      width: 100%;
      justify-content: center;
    }
    .pc-cell {
      width: 10px;
      height: 14px;
      display: block;
    }
    .pc-on { background: var(--paper-dim); }
    .pc-off {
      background: transparent;
      border: 1px solid var(--rule-bright);
    }
    .punch-sub {
      display: flex;
      gap: 8px;
      color: var(--paper-faint);
      font-size: 7px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    .punch-sub .amber { color: var(--amber); }
  </style>
</head>
<body>
  <main>
    <h1>// archivist relic — full composition · v3</h1>
    <div class="meta-line">
      OQ-GD-13 · v3 · sigil stack now reads pure game-identity (GENRE / THEME / PERSPECTIVE clusters from IGDB tags) · 24-mark vocabulary, 1 sigil = 1 value globally · classifiers in code · ${candidates.length} games with mock completion metadata
    </div>
    <div class="vocab-link"><a href="relic-vocabulary.html">→ sigil vocabulary reference</a></div>
    <div class="grid">
      ${relics.map((r) => renderRelicHtml(r)).join('\n')}
    </div>
  </main>
</body>
</html>`;
}

/* ── main ── */

/* ── vocabulary reference page ── */

function renderVocabHtml(): string {
  const card = (sigilName: string, dimension: string, value: string, absorbed: string[]): string => {
    const sigil = SIGIL_BY_NAME[sigilName];
    if (!sigil) return '';
    return `
      <div class="vcard">
        <div class="vsigil"><svg viewBox="0 0 40 40" width="64" height="64" xmlns="http://www.w3.org/2000/svg">${sigil.svg}</svg></div>
        <div class="vname">${sigilName}</div>
        <div class="vdim">${dimension} · <span class="vval">${value}</span></div>
        ${absorbed.length > 0 ? `<div class="vabsorbed">${absorbed.map((a) => `<span>${a}</span>`).join('')}</div>` : ''}
      </div>
    `;
  };

  // Build cards per dimension
  const genreCards = [...GENRE_RULES.map((r) => card(GENRE_SIGIL[r.cluster]!, 'GENRE', r.cluster, r.matches)),
                      card('half', 'GENRE', 'ASYLUM', ['(no recognised genre)'])];
  const themeCards = [...THEME_RULES.map((r) => card(THEME_SIGIL[r.cluster]!, 'THEME', r.cluster, r.matches)),
                      card('asterisk-6', 'THEME', 'APOCRYPHA', ['(no recognised theme)'])];
  const perspCards = Object.entries(PERSPECTIVE_SIGIL)
    .map(([persp, sigilName]) => card(sigilName, 'PERSPECTIVE', persp === 'SHROUD' ? 'SHROUD' : persp.toUpperCase(), persp === 'SHROUD' ? ['(no recognised perspective)'] : [persp]));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Hoard — Archivist Relic Sigil Vocabulary (OQ-GD-13)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --void: #07090a; --ink: #0d1012; --ink-2: #14181b;
      --paper: #ece8de; --paper-dim: #a9a89e; --paper-faint: #6b6f72;
      --rule: #23292d; --rule-bright: #2d3439; --amber: #d4a017;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: var(--void); color: var(--paper); font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 13px; line-height: 1.5; }
    main { padding: 32px 36px 80px; max-width: 1400px; margin: 0 auto; }
    h1 { font-size: 18px; color: var(--amber); letter-spacing: 0.05em; margin: 0 0 6px; }
    .meta-line { color: var(--paper-faint); font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 10px; }
    .back-link { margin-bottom: 28px; }
    .back-link a { color: var(--amber); text-decoration: none; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; border-bottom: 1px solid var(--rule); padding-bottom: 1px; }
    .back-link a:hover { border-bottom-color: var(--amber); }
    h2 { font-size: 13px; color: var(--paper); letter-spacing: 0.18em; text-transform: uppercase; margin: 32px 0 14px; padding-bottom: 8px; border-bottom: 1px solid var(--rule); }
    .vgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
    .vcard { background: var(--ink); border: 1px solid var(--rule); padding: 16px 14px 14px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .vsigil { padding: 12px 0 8px; }
    .vname { font-size: 10px; color: var(--paper-faint); letter-spacing: 0.14em; text-transform: lowercase; }
    .vdim { font-size: 9px; color: var(--paper-faint); letter-spacing: 0.16em; text-transform: uppercase; }
    .vval { color: var(--amber); letter-spacing: 0.14em; }
    .vabsorbed { margin-top: 8px; display: flex; flex-direction: column; gap: 2px; font-size: 9px; color: var(--paper-dim); text-align: center; letter-spacing: 0.06em; line-height: 1.5; }
    .vabsorbed span { display: block; }
  </style>
</head>
<body>
  <main>
    <h1>// sigil vocabulary</h1>
    <div class="meta-line">
      OQ-GD-13 · 24 marks · 3 dimensions · 1 sigil = 1 value globally · semantic / curated
    </div>
    <div class="back-link"><a href="relic-composition.html">← back to relic composition</a></div>

    <h2>// GENRE · 8 super-clusters</h2>
    <div class="vgrid">${genreCards.join('')}</div>

    <h2>// THEME · 8 super-clusters</h2>
    <div class="vgrid">${themeCards.join('')}</div>

    <h2>// PERSPECTIVE · 8 direct mappings</h2>
    <div class="vgrid">${perspCards.join('')}</div>
  </main>
</body>
</html>`;
}

async function main() {
  console.log('building full relic compositions…');
  const relics: BuiltRelic[] = [];
  for (const c of candidates) {
    try {
      relics.push(await buildRelic(c));
      console.log(`✓ ${c.title}`);
    } catch (e) {
      console.error(`✗ ${c.title}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (relics.length === 0) throw new Error('no relics built');
  const compositionHtml = renderHtml(relics);
  const vocabHtml = renderVocabHtml();
  // Bottom-band variant comparison: pick the first relic (Cyberpunk 2077)
  // and render it 4 times with each candidate bottom band.
  const variantSubject = relics[0]!;
  const variantsHtml = renderVariantsHtml(
    variantSubject,
    ['cartouche', 'sigil-seal', 'motto', 'punchcard'],
  );
  await Promise.all([
    writeFile('relic-composition.html', compositionHtml, 'utf-8'),
    writeFile('relic-vocabulary.html', vocabHtml, 'utf-8'),
    writeFile('relic-bottom-variants.html', variantsHtml, 'utf-8'),
    writeFile('iterations/relic-composition-v3-3dim.html', compositionHtml, 'utf-8'),
    writeFile('iterations/relic-vocabulary-v1.html', vocabHtml, 'utf-8'),
    writeFile('iterations/relic-bottom-variants-v1.html', variantsHtml, 'utf-8'),
  ]);
  console.log(`\nwrote relic-composition.html + relic-vocabulary.html + relic-bottom-variants.html + iterations/ copies (${relics.length} relics, 24 sigils, 4 bottom-band variants on ${variantSubject.meta.title})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
