-- Xbox sub-unit #4.1 — add Game.xboxTitleId for the playtime side-pass.
--
-- Mirrors the existing Game.steamAppId column. Captured during Xbox
-- library sync from OpenXBL /player/titleHistory; needed by the
-- POST /v2/player/stats playtime call which binds MinutesPlayed back
-- to a specific titleId.
--
-- Pure additive change — nullable + default null, no backfill needed.
-- Existing IGDB-only Game rows + future non-Xbox imports stay at NULL.
-- The Xbox library re-sync after this lands populates the column for
-- every IGDB-matched Xbox title.

ALTER TABLE "Game"
  ADD COLUMN "xboxTitleId" INTEGER;

CREATE UNIQUE INDEX "Game_xboxTitleId_key" ON "Game"("xboxTitleId");
