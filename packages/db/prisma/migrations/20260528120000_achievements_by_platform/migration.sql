-- M0 of the sync-expansion workstream (docs/SYNC_EXPANSION_PLAN.md).
--
-- Adds per-platform achievement storage on UserGame (mirrors playtimeByPlatform
-- shape) and drops the 4 flat achievement columns. Backfill attributes the
-- existing flat-column data to the user's most-recently-synced platform among
-- {ST, PS} that has a key present in playtimeByPlatform; falls back to PS
-- when neither key is present (matches the legacy achievementLabel default).
--
-- Wrapped in a single transaction so we never end up in an intermediate state
-- (new column added but flat columns still present, or vice versa).
-- Idempotent on the column-shape edges so a partial re-run is safe.
--
-- See Q0 probe in scripts/probe-m0-ambiguity.ts for ambiguity analysis.

BEGIN;

-- 1) Add the new per-platform JSON column. Default `{}` matches the schema
--    default so existing rows + new rows both start clean.
ALTER TABLE "UserGame"
  ADD COLUMN IF NOT EXISTS "achievementsByPlatform" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2) Backfill. For each UserGame with non-null achievementsTotal, attribute
--    the flat-column data to a single platform key:
--
--      - If playtimeByPlatform has BOTH 'ST' and 'PS' keys: pick the user's
--        most-recently-synced platform of those two.
--      - If only 'ST' is present: ST.
--      - If only 'PS' is present: PS.
--      - If neither: fall back to PS (matches legacy default).
--
--    The 'ST'/'PS' keys may have value 0 (P-FIX-2 backfill) — that still
--    counts as a Steam/PSN attribution signal because the achievement
--    writer touched the row at some point.
UPDATE "UserGame" ug
SET "achievementsByPlatform" = jsonb_build_object(
  COALESCE(
    (SELECT p.code::text FROM "Platform" p
     WHERE p."userId" = ug."userId"
       AND p.code IN ('ST', 'PS')
       AND ug."playtimeByPlatform" ? p.code::text
     ORDER BY p."lastSyncAt" DESC NULLS LAST LIMIT 1),
    CASE
      WHEN ug."playtimeByPlatform" ? 'ST' THEN 'ST'
      WHEN ug."playtimeByPlatform" ? 'PS' THEN 'PS'
      ELSE 'PS'
    END
  ),
  jsonb_build_object(
    'earned', ug."achievementsEarned",
    'total', ug."achievementsTotal",
    'percent', ug."achievementsPercent",
    'updatedAt', COALESCE(ug."achievementsUpdatedAt", NOW())
  )
)
WHERE ug."achievementsTotal" IS NOT NULL;

-- 3) Drop the 4 flat columns. New writers (PSN trophy aggregator, Steam
--    achievement aggregator) already use achievementsByPlatform; nothing
--    reads the old columns.
ALTER TABLE "UserGame" DROP COLUMN IF EXISTS "achievementsEarned";
ALTER TABLE "UserGame" DROP COLUMN IF EXISTS "achievementsTotal";
ALTER TABLE "UserGame" DROP COLUMN IF EXISTS "achievementsPercent";
ALTER TABLE "UserGame" DROP COLUMN IF EXISTS "achievementsUpdatedAt";

COMMIT;
