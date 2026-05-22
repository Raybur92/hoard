-- F1-PR2 of the manual-add UX overhaul (docs/INTERACTION_FLOW.md +
-- docs/SURFACE.md). Adds the four UserGame columns needed to capture
-- collector metadata + per-platform wishlist intent per CM2 + CM12 of
-- docs/CONCEPTUAL_MODEL.md.
--
-- Pure additive change — no backfill, no behaviour change at this
-- commit. All four columns are nullable / default-empty:
--   * mediaType            — null on existing rows (sync-imported games
--                            don't get a mediaType; that's fine — the UI
--                            shows them as "owned via sync" without media
--                            granularity). Manual-add sets it explicitly.
--   * condition + region   — null by default; only meaningful when
--                            mediaType=PHYSICAL.
--   * wishlistedPlatforms  — empty array by default. Per CM13 (the
--                            wishlist auto-promotion decision), the
--                            Releases-page toggle does NOT auto-populate
--                            this. Only the explicit GameDetail per-row
--                            affordance ("I want PC version too" on a
--                            game already owned on PS5) writes to it.
--
-- Per CM12, the column's purpose is enabling the collector-completion
-- "I want this on a specific platform variant" case without changing
-- the default wishlist semantic (which stays platform-agnostic per
-- CM13).
--
-- The mediaType enum is the 2-value simplification locked 2026-05-22
-- (DIGITAL | PHYSICAL) — disc/cart/ROM differentiation was over-modeling;
-- the platform code tells you the physical form. The richer 4-value
-- enum (PHYSICAL_DISC | PHYSICAL_CART | ROM_CART | DIGITAL_KEY) lives on
-- MarketplaceListing.mediaType per §3.19 — different scope.

-- ── enums ──

CREATE TYPE "MediaType" AS ENUM ('DIGITAL', 'PHYSICAL');

CREATE TYPE "Condition" AS ENUM ('LOOSE', 'CIB', 'SEALED', 'REPLICA', 'GRADED');

CREATE TYPE "Region" AS ENUM ('NTSC_U', 'NTSC_J', 'PAL', 'OTHER');

-- ── UserGame columns ──

ALTER TABLE "UserGame"
  ADD COLUMN "mediaType"           "MediaType",
  ADD COLUMN "condition"           "Condition",
  ADD COLUMN "region"              "Region",
  ADD COLUMN "wishlistedPlatforms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
