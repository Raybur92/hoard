-- B-IGDB-3 — IGDB-tag triple foundation.
-- Adds `themes` and `playerPerspectives` String[] columns to `Game`.
-- `genres` already exists; this rounds out the IGDB-tag triple.
-- Backfill from IGDB lands in a separate script post-deploy.

ALTER TABLE "Game"
  ADD COLUMN IF NOT EXISTS "themes" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Game"
  ADD COLUMN IF NOT EXISTS "playerPerspectives" TEXT[] DEFAULT ARRAY[]::TEXT[];
