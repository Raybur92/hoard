-- M2 of the sync-expansion workstream (docs/SYNC_EXPANSION_PLAN.md).
--
-- Adds Game.epicCatalogItemId @unique for stable IGDB external_games
-- resolution via the URL pattern "store.epicgames.com".
--
-- Epic catalog item IDs are opaque hex strings (e.g. "5e02bda5cb274ccd9d…"),
-- not numeric — unlike steamAppId / psnConceptId / xboxTitleId / itchGameId.
--
-- IF NOT EXISTS guards make this idempotent so a partial re-run is safe.
-- EP enum value already exists in PlatformCode (predates the M-series).

ALTER TABLE "Game"
  ADD COLUMN IF NOT EXISTS "epicCatalogItemId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Game_epicCatalogItemId_key"
  ON "Game"("epicCatalogItemId");
