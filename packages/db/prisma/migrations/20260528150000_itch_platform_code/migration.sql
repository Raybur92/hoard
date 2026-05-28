-- M1 of the sync-expansion workstream (docs/SYNC_EXPANSION_PLAN.md).
--
-- Adds the IT platform code (itch.io) + Game.itchGameId @unique for
-- stable IGDB external_games resolution via the URL pattern "itch.io".
--
-- IF NOT EXISTS guards make this idempotent so a partial re-run is safe.
--
-- ALTER TYPE … ADD VALUE is run outside a transaction (Postgres allows
-- it inside a transaction since 12, but the new value can't be USED in
-- the same transaction — we don't use it here, but splitting is safer
-- in case of future edits to this file).

ALTER TYPE "PlatformCode" ADD VALUE IF NOT EXISTS 'IT';

ALTER TABLE "Game"
  ADD COLUMN IF NOT EXISTS "itchGameId" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "Game_itchGameId_key"
  ON "Game"("itchGameId");
