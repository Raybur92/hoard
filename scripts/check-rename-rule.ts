/**
 * Belt-and-suspenders enforcement of decision D1 in docs/RELEASES_PLAN.md §1.
 *
 * The Upcoming → Releases page rework is intentionally URL + UI labels only.
 * Internal symbols (`useUpcoming`, `IgdbUpcomingRelease`, `WishlistRelease`,
 * the `/api/igdb/upcoming` and `/api/upcoming/:igdbId/wishlist` routes, the
 * `WishlistRelease` table) all stay. Renaming any of them is the kind of
 * mistake an over-eager search-and-replace causes.
 *
 * This script greps the codebase for the renamed symbol-shapes that would
 * indicate someone went through with a rename anyway. If any are found,
 * fails with a pointer to the canonical decision. Runs in CI on every PR.
 *
 * Manual override: if a future workstream legitimately renames these (e.g.
 * a v2 API redesign), revisit RELEASES_PLAN.md §1 and update this script
 * to match. Don't bypass it silently.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

interface ForbiddenPattern {
  pattern: RegExp;
  reason: string;
  permittedFiles?: RegExp; // matches paths where the pattern is OK (e.g. this script itself)
}

const ROOT = new URL('..', import.meta.url).pathname;

const FORBIDDEN: ForbiddenPattern[] = [
  // Hook rename
  {
    pattern: /\buseReleases\b/,
    reason: 'use `useUpcoming` instead — see RELEASES_PLAN.md §1 (D1).',
  },
  // Type renames
  {
    pattern: /\bIgdbReleasesRelease\b|\bIgdbReleaseRelease\b/,
    reason: 'use `IgdbUpcomingRelease` instead — see RELEASES_PLAN.md §1 (D1).',
  },
  {
    pattern: /\binterface\s+ReleasesRelease\b|\btype\s+ReleasesRelease\b/,
    reason: 'use `WishlistRelease` instead — see RELEASES_PLAN.md §1 (D1).',
  },
  // Backend route renames — accept `/api/releases/recent` (planned in R1) but
  // not anything else under /api/releases/* that mirrors an existing /api/upcoming/*
  // route. The new /releases prefix is reserved for the new RECENT endpoint only.
  {
    pattern: /['"`]\/api\/releases\/(?!recent\b)\w/,
    reason: 'only `/api/releases/recent` is a sanctioned new route. Existing `/api/upcoming/...` and `/api/igdb/upcoming` routes stay — see RELEASES_PLAN.md §1 (D1).',
  },
  // Prisma model rename
  {
    pattern: /\bmodel\s+ReleasesRelease\b|\bmodel\s+UpcomingRelease\b/,
    reason: '`WishlistRelease` is the canonical model — see RELEASES_PLAN.md §1 (D1).',
  },
];

const SCAN_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.prisma', '.md']);
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.git',
  'coverage',
  'playwright-report',
  '.vercel',
  '.railway',
]);

// docs/ files are allowed to mention forbidden symbols (they document them).
// The check script itself obviously contains them.
const ALWAYS_PERMITTED: RegExp[] = [
  /\bdocs\//,
  /\bscripts\/check-rename-rule\.ts$/,
];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) yield* walk(full);
    else if (SCAN_EXTS.has(extname(entry))) yield full;
  }
}

function isPermitted(relPath: string, p: ForbiddenPattern): boolean {
  if (ALWAYS_PERMITTED.some((re) => re.test(relPath))) return true;
  if (p.permittedFiles?.test(relPath)) return true;
  return false;
}

interface Hit { file: string; line: number; lineText: string; reason: string; }

function main(): void {
  const hits: Hit[] = [];

  for (const file of walk(ROOT)) {
    const relPath = file.slice(ROOT.length).replace(/^\/+/, '');
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (const p of FORBIDDEN) {
      if (isPermitted(relPath, p)) continue;
      for (let i = 0; i < lines.length; i++) {
        if (p.pattern.test(lines[i]!)) {
          hits.push({ file: relPath, line: i + 1, lineText: lines[i]!.trim(), reason: p.reason });
        }
      }
    }
  }

  if (hits.length === 0) {
    console.log('✓ rename-rule: no forbidden symbols found.');
    return;
  }

  console.error('');
  console.error('✗ rename-rule: forbidden symbols found.');
  console.error('');
  console.error('  The Upcoming → Releases rework is URL + UI labels ONLY (decision D1).');
  console.error('  Internal symbols stay. See docs/RELEASES_PLAN.md §1 for the full matrix.');
  console.error('');
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}`);
    console.error(`    ${h.lineText}`);
    console.error(`    → ${h.reason}`);
    console.error('');
  }
  process.exit(1);
}

main();
