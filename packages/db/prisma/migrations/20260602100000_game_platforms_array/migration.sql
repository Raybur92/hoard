-- DEALS-PR2.5+ — IGDB-tagged platforms array on Game. Pre-filter for
-- per-storefront deal syncs (avoids 2000-query roundtrips against
-- Nintendo/PSN APIs for PC-only games). IDEMPOTENT — safe to re-apply.
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "platforms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
