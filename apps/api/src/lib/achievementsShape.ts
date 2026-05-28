import type { AchievementsByPlatform, AchievementEntry, PlatformCode } from '@hoard/types';

const VALID_CODES: ReadonlySet<PlatformCode> = new Set<PlatformCode>([
  'ST', 'PS', 'XB', 'GG', 'NT', 'EP',
]);

function isValidEntry(v: unknown): v is AchievementEntry {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r['earned'] === 'number' &&
    typeof r['total'] === 'number' &&
    typeof r['percent'] === 'number' &&
    typeof r['updatedAt'] === 'string'
  );
}

/**
 * Narrow Prisma's `unknown` JSON column to the typed `AchievementsByPlatform`
 * shape. Defensive: silently drops entries with unknown platform codes or
 * malformed structure. Returns `{}` when the input is null / non-object /
 * empty.
 *
 * Lives next to the mapper because mappers are the only legitimate place
 * to coerce `unknown` → typed; everywhere else uses the typed shape.
 */
export function normalizeAchievementsByPlatform(raw: unknown): AchievementsByPlatform {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: AchievementsByPlatform = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!VALID_CODES.has(k as PlatformCode)) continue;
    if (!isValidEntry(v)) continue;
    out[k as PlatformCode] = v;
  }
  return out;
}
