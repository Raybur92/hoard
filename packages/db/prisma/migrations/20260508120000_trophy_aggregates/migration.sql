-- T1 of the trophies & achievements workstream (docs/TROPHIES_PLAN.md).
--
-- Adds:
--   * Game.psnNpCommunicationId   — stable PSN per-title identifier, populated
--                                    by T2 (PSN trophy fetcher). Lets future
--                                    PSN syncs rebind by PSN identity instead
--                                    of fuzzy title-matching. @unique because
--                                    the npCommunicationId is universal per
--                                    game (every PSN player of a given title
--                                    shares the same id).
--   * UserGame.achievementsEarned    — count earned by this user
--   * UserGame.achievementsTotal     — count available for the game
--   * UserGame.achievementsPercent   — round(earned / total * 100), 0..100
--   * UserGame.achievementsUpdatedAt — when we last fetched
--
-- All five columns are nullable. Pre-T2/T3 rows have NULL across the
-- board; the GameDetail receipt-block UI hides the trophies/achievements
-- line when `achievementsTotal IS NULL`. Same null semantics for games
-- that don't support achievements at all (Steam returns success=false).

ALTER TABLE "Game"
  ADD COLUMN "psnNpCommunicationId" TEXT;

CREATE UNIQUE INDEX "Game_psnNpCommunicationId_key"
  ON "Game"("psnNpCommunicationId");

ALTER TABLE "UserGame"
  ADD COLUMN "achievementsEarned"    INTEGER,
  ADD COLUMN "achievementsTotal"     INTEGER,
  ADD COLUMN "achievementsPercent"   INTEGER,
  ADD COLUMN "achievementsUpdatedAt" TIMESTAMP(3);
