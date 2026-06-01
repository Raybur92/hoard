-- GD-PR4a — pre-rendered shape-dither SVG for the OQ-GD-13 archivist
-- relic centerpiece. Stored as text (typically 15-30 KB / row). Nullable
-- so a Game without a hero image (or with a failed render) still loads.
-- Cleared on any heroImageUrl change so the next read regenerates against
-- the new source image.
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "relicDitherSvg" TEXT;
