-- M3 of the sync-expansion workstream (docs/SYNC_EXPANSION_PLAN.md).
--
-- Adds Game.nintendoTitleId @unique for stable IGDB external_games
-- resolution via the URL pattern "nintendo.com".
--
-- Switch application IDs are 16-character hex strings (the same field
-- the Parental Controls "Moon" API surfaces as `applicationId`), not
-- numeric — unlike steamAppId / psnConceptId / xboxTitleId / itchGameId.
-- Matches Epic's String shape.
--
-- IF NOT EXISTS guards make this idempotent so a partial re-run is safe.
-- NT enum value already exists in PlatformCode (predates the M-series).

ALTER TABLE "Game"
  ADD COLUMN IF NOT EXISTS "nintendoTitleId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Game_nintendoTitleId_key"
  ON "Game"("nintendoTitleId");
