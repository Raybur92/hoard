-- Capture the richer identifiers exposed by the codepotatoes.de HLTB payload
-- (hltbId, gogAppId) and tag the source on HltbData rows so we can layer in
-- IGDB time_to_beat as a fallback when HLTB has no Steam-ID match.
--
-- Drafted alongside docs/INTERACTION_DEBT_PLAN.md PR D — see that file for the
-- diagnostic results (318/929 games covered before this work) and the layered
-- fallback chain (Steam-ID → Steam Store search → IGDB time_to_beat).

ALTER TABLE "Game"
  ADD COLUMN "hltbId" INTEGER,
  ADD COLUMN "gogAppId" INTEGER;

ALTER TABLE "HltbData"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'hltb';
