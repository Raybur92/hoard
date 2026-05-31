-- B-IGDB-3b2 follow-up — landscape hero image for Library OVERVIEW cards.
-- Nullable because IGDB doesn't have artworks/screenshots for every game;
-- the LibraryOverviewCard renderer falls back to coverUrl when null.
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "heroImageUrl" TEXT;
