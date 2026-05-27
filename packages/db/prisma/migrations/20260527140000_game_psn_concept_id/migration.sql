-- N-series — add Game.psnConceptId for the Sony-id-first resolution path.
--
-- Mirrors Game.steamAppId / Game.xboxTitleId. Captured during PSN library
-- sync from psn-api's `getUserPlayedGames` response (titles[].concept.id);
-- maps to IGDB's `external_games.uid` where category = 36 (Playstation
-- Store). syncRunner uses this BEFORE title search so non-English PSN
-- titles (Italian, Chinese, etc.) resolve correctly via the stable Sony
-- identifier instead of going through fuzzy title matching.
--
-- Pure additive change — nullable + default null, no backfill needed.
-- Existing PSN-platformed Game rows stay at NULL until the next library
-- sync re-imports them through the new resolution path. Wishlist-only
-- Games unaffected.

ALTER TABLE "Game"
  ADD COLUMN "psnConceptId" INTEGER;

CREATE UNIQUE INDEX "Game_psnConceptId_key" ON "Game"("psnConceptId");
