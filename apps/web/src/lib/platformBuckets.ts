// F1-PR1 platform picker — bucket classification.
//
// Restructured 2026-05-22 (Andrea's pushback): the original Digital /
// Physical / Retro bucketing conflated two different concepts. Digital
// listed STORES (Steam, PSN, Xbox Live, eShop) while Physical/Retro
// listed CONSOLES (PS5, Switch, SNES). Stores and consoles are not the
// same kind of thing — a game is published on consoles; stores are
// sync metadata that Hoard handles automatically. Andrea's correction:
// "Why would I select PSN instead of PS5?"
//
// New structure: bucket by manufacturer / ecosystem, contents are
// CONSOLES ONLY. Stores aren't picker entries at all — for digital
// games on PC, the user picks "PC" and mediaType=DIGITAL (PR2); the
// specific storefront (Steam/GOG/Epic/etc.) becomes optional metadata
// in PR3+. For sync-capable platforms (Steam/PSN/Xbox/GOG via Hoard's
// sync flow) the games never reach manual-add anyway — sync handles
// them.
//
// IGDB's `platforms[]` field returns consoles, not stores ("PlayStation 5",
// "Xbox Series X|S", "PC (Microsoft Windows)", "Nintendo Switch") —
// confirming this is the right shape for IGDB-driven pre-opening +
// suggested pins.
//
// `inferBucketFromIgdb` maps an IGDB platform name string to a bucket.
// Aliases handle IGDB's verbose naming (e.g. IGDB says "Nintendo Switch",
// Hoard's label is "Switch").
//
// For PR1 the backend still receives `platformLabel: string`. The bucket
// is metadata for the picker only — used to pre-open the right bucket
// tab when IGDB has platform data (OQ-F1-9) and to group Stage-2 entries.
// PR2+ will bind to Platform.code or RetroPlatform.id; the structure
// here is forward-compatible with that schema work.

export type PlatformBucket = 'pc' | 'playstation' | 'xbox' | 'nintendo' | 'sega' | 'other';

export interface PlatformOption {
  /** Bucket the platform lives in (manufacturer / ecosystem). */
  bucket: PlatformBucket;
  /** Hoard's canonical label — what the user sees + what gets saved as platformLabel. */
  label: string;
  /** 2-4 char badge shown on the platform's `.plat` glyph. */
  code: string;
  /** Alternative IGDB platform names that map to this option. */
  igdbAliases: string[];
}

// Curated v1 enumeration — CONSOLES across modern + retro generations.
// Stores (Steam, PSN, Xbox Live, eShop, GOG, Epic, Itch, Humble) are
// deliberately NOT included; the user records consoles, not purchase
// venues. Niche storefronts that ARE hardware-agnostic (Itch, Humble)
// fold into "PC" + the future store-metadata field.
//
// Order within each bucket is roughly "newest first" then chronologically
// back for that family. The picker re-sorts to alphabetical in the "// all"
// pin section.
export const PLATFORM_OPTIONS: PlatformOption[] = [
  // ── PC ──
  // PC is one entry that covers all PC storefronts. The user picks PC; the
  // storefront (Steam/GOG/Epic/Itch/Humble/MS Store/Prime) becomes optional
  // metadata in PR3+. mediaType (PR2) differentiates physical PC discs
  // (rare collector items) from digital downloads.
  { bucket: 'pc',         label: 'PC',                 code: 'PC',   igdbAliases: ['PC (Microsoft Windows)', 'PC DOS', 'Windows', 'Linux', 'Mac', 'macOS', 'Steam'] },
  { bucket: 'pc',         label: 'Steam Deck',         code: 'SDK',  igdbAliases: [] },

  // ── PlayStation ──
  { bucket: 'playstation', label: 'PS5',               code: 'PS5',  igdbAliases: ['PlayStation 5'] },
  { bucket: 'playstation', label: 'PS4',               code: 'PS4',  igdbAliases: ['PlayStation 4'] },
  { bucket: 'playstation', label: 'PS3',               code: 'PS3',  igdbAliases: ['PlayStation 3'] },
  { bucket: 'playstation', label: 'PS2',               code: 'PS2',  igdbAliases: ['PlayStation 2'] },
  { bucket: 'playstation', label: 'PS1',               code: 'PS1',  igdbAliases: ['PlayStation', 'PlayStation 1'] },
  { bucket: 'playstation', label: 'PSP',               code: 'PSP',  igdbAliases: ['PlayStation Portable'] },
  { bucket: 'playstation', label: 'PS Vita',           code: 'VITA', igdbAliases: ['PlayStation Vita'] },

  // ── Xbox ──
  { bucket: 'xbox',        label: 'Xbox Series X|S',   code: 'XSX',  igdbAliases: ['Xbox Series X', 'Xbox Series X|S', 'Xbox Series S'] },
  { bucket: 'xbox',        label: 'Xbox One',          code: 'XB1',  igdbAliases: ['Xbox One'] },
  { bucket: 'xbox',        label: 'Xbox 360',          code: 'X360', igdbAliases: ['Xbox 360'] },
  { bucket: 'xbox',        label: 'Xbox (classic)',    code: 'XBOX', igdbAliases: ['Xbox'] },

  // ── Nintendo (modern + retro) ──
  { bucket: 'nintendo',    label: 'Switch',            code: 'NS',   igdbAliases: ['Nintendo Switch'] },
  { bucket: 'nintendo',    label: 'Wii U',             code: 'WIU',  igdbAliases: ['Wii U'] },
  { bucket: 'nintendo',    label: 'Wii',               code: 'WII',  igdbAliases: ['Wii'] },
  { bucket: 'nintendo',    label: 'GameCube',          code: 'GCN',  igdbAliases: ['Nintendo GameCube'] },
  { bucket: 'nintendo',    label: 'N64',               code: 'N64',  igdbAliases: ['Nintendo 64'] },
  { bucket: 'nintendo',    label: 'SNES',              code: 'SNES', igdbAliases: ['Super Nintendo Entertainment System', 'Super Famicom', 'SNES'] },
  { bucket: 'nintendo',    label: 'NES',               code: 'NES',  igdbAliases: ['Nintendo Entertainment System', 'NES', 'Famicom'] },
  { bucket: 'nintendo',    label: '3DS',               code: '3DS',  igdbAliases: ['Nintendo 3DS', 'New Nintendo 3DS'] },
  { bucket: 'nintendo',    label: 'DS',                code: 'NDS',  igdbAliases: ['Nintendo DS'] },
  { bucket: 'nintendo',    label: 'Game Boy Advance',  code: 'GBA',  igdbAliases: ['Game Boy Advance'] },
  { bucket: 'nintendo',    label: 'Game Boy Color',    code: 'GBC',  igdbAliases: ['Game Boy Color'] },
  { bucket: 'nintendo',    label: 'Game Boy',          code: 'GB',   igdbAliases: ['Game Boy'] },

  // ── Sega ──
  { bucket: 'sega',        label: 'Dreamcast',         code: 'DC',   igdbAliases: ['Dreamcast'] },
  { bucket: 'sega',        label: 'Saturn',            code: 'SAT',  igdbAliases: ['Sega Saturn'] },
  { bucket: 'sega',        label: 'Genesis',           code: 'GEN',  igdbAliases: ['Sega Mega Drive/Genesis', 'Sega Genesis', 'Mega Drive'] },
  { bucket: 'sega',        label: 'Game Gear',         code: 'GG',   igdbAliases: ['Sega Game Gear'] },
  { bucket: 'sega',        label: 'Master System',     code: 'SMS',  igdbAliases: ['Sega Master System'] },

  // ── Other / retro ──
  { bucket: 'other',       label: 'Atari 2600',        code: 'A26',  igdbAliases: ['Atari 2600'] },
  { bucket: 'other',       label: 'NeoGeo',            code: 'NEO',  igdbAliases: ['Neo Geo AES', 'Neo Geo MVS', 'Neo Geo Pocket'] },
  { bucket: 'other',       label: 'TurboGrafx-16',     code: 'TG16', igdbAliases: ['TurboGrafx-16/PC Engine', 'PC Engine'] },
  { bucket: 'other',       label: 'Commodore 64',      code: 'C64',  igdbAliases: ['Commodore C64/128/MAX'] },
  { bucket: 'other',       label: 'Amiga',             code: 'AMI',  igdbAliases: ['Amiga'] },
  { bucket: 'other',       label: 'ZX Spectrum',       code: 'ZX',   igdbAliases: ['ZX Spectrum', 'Sinclair ZX Spectrum'] },
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
 * original platform comes first). Falls back to `pc` when there's no
 * IGDB platform data or no suggestion matches — most-common default for
 * the F1 use case (the user adding a manual PC game, e.g. Itch/Humble,
 * is the most plausible no-IGDB-platforms scenario).
 */
export function preferredBucketFromIgdb(igdbNames: string[]): PlatformBucket {
  const suggested = suggestedFromIgdbPlatforms(igdbNames);
  return suggested.length > 0 ? suggested[0]!.bucket : 'pc';
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
