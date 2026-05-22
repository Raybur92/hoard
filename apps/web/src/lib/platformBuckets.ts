// F1-PR1 platform picker — bucket classification.
//
// Per CM12 + F1 surface §4: the picker has three Stage-1 buckets
// (Digital / Physical / Retro). Each platform belongs to exactly one
// bucket. The Stage-2 list within a bucket shows the enumerated entries
// plus a freeform "Other" escape hatch (per OQ-F1-8).
//
// `inferBucketFromIgdb` maps an IGDB platform name string to a bucket.
// IGDB names are not always identical to Hoard's labels (e.g. IGDB says
// "PlayStation 5", Hoard's label is "PS5"); the function normalises both
// for matching and returns the canonical Hoard label when found.
//
// For PR1 the backend still receives `platformLabel: string`. The bucket
// is metadata for the picker only — used to pre-open the right Stage-1
// tab when IGDB has platform data (OQ-F1-9) and to group Stage-2 entries.
// PR2+ will bind to Platform.code or RetroPlatform.id; the structure
// here is forward-compatible with that schema work.

export type PlatformBucket = 'digital' | 'physical' | 'retro';

export interface PlatformOption {
  /** Bucket the platform lives in. */
  bucket: PlatformBucket;
  /** Hoard's canonical label — what the user sees + what gets saved as platformLabel. */
  label: string;
  /** 2-4 char badge shown on the platform's `.plat` glyph. */
  code: string;
  /** Alternative IGDB platform names that map to this option. */
  igdbAliases: string[];
}

// Curated v1 enumeration. Not exhaustive — the freeform "Other" escape
// hatch (per OQ-F1-8) covers everything not listed here. Order within
// each bucket is roughly "most-common first" for the default scroll
// position, but the picker re-sorts to alphabetical in the "// all"
// pin section.
export const PLATFORM_OPTIONS: PlatformOption[] = [
  // ── digital ──
  { bucket: 'digital', label: 'Steam',             code: 'ST',  igdbAliases: ['PC (Microsoft Windows)', 'Steam'] },
  { bucket: 'digital', label: 'PlayStation Store', code: 'PS',  igdbAliases: ['PlayStation Network'] },
  { bucket: 'digital', label: 'Xbox Live',         code: 'XB',  igdbAliases: ['Xbox Network', 'Xbox Live'] },
  { bucket: 'digital', label: 'GOG',               code: 'GG',  igdbAliases: ['GOG.com', 'GOG'] },
  { bucket: 'digital', label: 'Nintendo eShop',    code: 'NS',  igdbAliases: ['Nintendo eShop'] },
  { bucket: 'digital', label: 'Epic Games',        code: 'EP',  igdbAliases: ['Epic Games Store'] },
  { bucket: 'digital', label: 'Itch.io',           code: 'IT',  igdbAliases: ['itch.io'] },
  { bucket: 'digital', label: 'Humble Bundle',     code: 'HB',  igdbAliases: [] },
  { bucket: 'digital', label: 'Twitch / Prime',    code: 'TW',  igdbAliases: [] },
  { bucket: 'digital', label: 'Microsoft Store',   code: 'MS',  igdbAliases: [] },

  // ── physical (current + recent gen) ──
  { bucket: 'physical', label: 'PS5',               code: 'PS5', igdbAliases: ['PlayStation 5'] },
  { bucket: 'physical', label: 'PS4',               code: 'PS4', igdbAliases: ['PlayStation 4'] },
  { bucket: 'physical', label: 'Xbox Series X|S',   code: 'XSX', igdbAliases: ['Xbox Series X', 'Xbox Series X|S', 'Xbox Series S'] },
  { bucket: 'physical', label: 'Xbox One',          code: 'XB1', igdbAliases: ['Xbox One'] },
  { bucket: 'physical', label: 'Switch',            code: 'NT',  igdbAliases: ['Nintendo Switch'] },
  { bucket: 'physical', label: 'Steam Deck',        code: 'SDK', igdbAliases: [] },

  // ── retro ──
  { bucket: 'retro', label: 'NES',                 code: 'NES',   igdbAliases: ['Nintendo Entertainment System', 'NES', 'Famicom'] },
  { bucket: 'retro', label: 'SNES',                code: 'SNES',  igdbAliases: ['Super Nintendo Entertainment System', 'Super Famicom', 'SNES'] },
  { bucket: 'retro', label: 'N64',                 code: 'N64',   igdbAliases: ['Nintendo 64'] },
  { bucket: 'retro', label: 'GameCube',            code: 'GCN',   igdbAliases: ['Nintendo GameCube'] },
  { bucket: 'retro', label: 'Wii',                 code: 'WII',   igdbAliases: ['Wii'] },
  { bucket: 'retro', label: 'Wii U',               code: 'WIU',   igdbAliases: ['Wii U'] },
  { bucket: 'retro', label: 'Game Boy',            code: 'GB',    igdbAliases: ['Game Boy'] },
  { bucket: 'retro', label: 'Game Boy Color',      code: 'GBC',   igdbAliases: ['Game Boy Color'] },
  { bucket: 'retro', label: 'Game Boy Advance',    code: 'GBA',   igdbAliases: ['Game Boy Advance'] },
  { bucket: 'retro', label: 'DS',                  code: 'NDS',   igdbAliases: ['Nintendo DS'] },
  { bucket: 'retro', label: '3DS',                 code: '3DS',   igdbAliases: ['Nintendo 3DS', 'New Nintendo 3DS'] },
  { bucket: 'retro', label: 'PS1',                 code: 'PS1',   igdbAliases: ['PlayStation', 'PlayStation 1'] },
  { bucket: 'retro', label: 'PS2',                 code: 'PS2',   igdbAliases: ['PlayStation 2'] },
  { bucket: 'retro', label: 'PS3',                 code: 'PS3',   igdbAliases: ['PlayStation 3'] },
  { bucket: 'retro', label: 'PSP',                 code: 'PSP',   igdbAliases: ['PlayStation Portable'] },
  { bucket: 'retro', label: 'PS Vita',             code: 'VITA',  igdbAliases: ['PlayStation Vita'] },
  { bucket: 'retro', label: 'Xbox 360',            code: 'X360',  igdbAliases: ['Xbox 360'] },
  { bucket: 'retro', label: 'Xbox (classic)',      code: 'XBOX',  igdbAliases: ['Xbox'] },
  { bucket: 'retro', label: 'Genesis',             code: 'GEN',   igdbAliases: ['Sega Mega Drive/Genesis', 'Sega Genesis', 'Mega Drive'] },
  { bucket: 'retro', label: 'Saturn',              code: 'SAT',   igdbAliases: ['Sega Saturn'] },
  { bucket: 'retro', label: 'Dreamcast',           code: 'DC',    igdbAliases: ['Dreamcast'] },
  { bucket: 'retro', label: 'Master System',       code: 'SMS',   igdbAliases: ['Sega Master System'] },
  { bucket: 'retro', label: 'Game Gear',           code: 'GG',    igdbAliases: ['Sega Game Gear'] },
  { bucket: 'retro', label: 'Atari 2600',          code: 'A26',   igdbAliases: ['Atari 2600'] },
  { bucket: 'retro', label: 'NeoGeo',              code: 'NEO',   igdbAliases: ['Neo Geo AES', 'Neo Geo MVS', 'Neo Geo Pocket'] },
  { bucket: 'retro', label: 'TurboGrafx-16',       code: 'TG16',  igdbAliases: ['TurboGrafx-16/PC Engine', 'PC Engine'] },
  { bucket: 'retro', label: 'Commodore 64',        code: 'C64',   igdbAliases: ['Commodore C64/128/MAX'] },
  { bucket: 'retro', label: 'Amiga',               code: 'AMI',   igdbAliases: ['Amiga'] },
  { bucket: 'retro', label: 'ZX Spectrum',         code: 'ZX',    igdbAliases: ['ZX Spectrum', 'Sinclair ZX Spectrum'] },
  { bucket: 'retro', label: 'Wii VC',              code: 'VC',    igdbAliases: ['Wii Virtual Console'] },
];

/**
 * Find a curated platform option by its canonical Hoard label.
 * Used when restoring a pinned platform from a prior add session.
 */
export function findByLabel(label: string): PlatformOption | undefined {
  return PLATFORM_OPTIONS.find((p) => p.label === label);
}

/**
 * Map an IGDB platform name string to a curated PlatformOption.
 * Returns undefined when no alias matches (the IGDB platform is too obscure
 * or not enumerated). Caller can fall back to displaying the IGDB name as
 * a freeform suggestion or skip it entirely.
 *
 * Matching is case-insensitive on aliases. Hoard's canonical label is NOT
 * an automatic alias — aliases are explicit so we don't get false positives
 * from generic terms.
 */
export function inferFromIgdb(igdbName: string): PlatformOption | undefined {
  const needle = igdbName.toLowerCase().trim();
  if (!needle) return undefined;
  return PLATFORM_OPTIONS.find((opt) =>
    opt.igdbAliases.some((alias) => alias.toLowerCase() === needle),
  );
}

/**
 * Given a list of IGDB platform names (e.g. from IgdbSearchResult.platforms),
 * return the deduped list of curated PlatformOptions in the same order as
 * the input. Unmatched IGDB names are silently skipped — they go into the
 * "Other / freeform" escape hatch path at the picker level if the user
 * needs them.
 *
 * Used for the "// suggested for this game" Stage-2 pin section
 * per OQ-F1-9.
 */
export function suggestedFromIgdbPlatforms(igdbNames: string[]): PlatformOption[] {
  const seen = new Set<string>();
  const out: PlatformOption[] = [];
  for (const name of igdbNames) {
    const opt = inferFromIgdb(name);
    if (opt && !seen.has(opt.label)) {
      seen.add(opt.label);
      out.push(opt);
    }
  }
  return out;
}

/**
 * Decide which Stage-1 bucket to pre-open when the user lands in P2 with
 * an IGDB-resolved game. Returns the bucket of the FIRST suggested platform
 * (IGDB's reported platform order is roughly release-order — typically the
 * original platform comes first). Falls back to `digital` when there's no
 * IGDB platform data or no suggestion matches — most-common default per
 * OQ-S-2.
 */
export function preferredBucketFromIgdb(igdbNames: string[]): PlatformBucket {
  const suggested = suggestedFromIgdbPlatforms(igdbNames);
  return suggested.length > 0 ? suggested[0]!.bucket : 'digital';
}

/**
 * All platforms in a bucket, alphabetically sorted by label.
 * Used for the "// all" pin section of Stage-2.
 */
export function bucketOptions(bucket: PlatformBucket): PlatformOption[] {
  return PLATFORM_OPTIONS
    .filter((p) => p.bucket === bucket)
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label));
}
