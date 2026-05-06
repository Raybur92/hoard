-- Adds the IGDB category field (DLC=2, remake=8, etc) to WishlistRelease so
-- the persisted view of a user's wishlist matches the live IGDB feed shape.
-- Drafted alongside docs/INTERACTION_DEBT_PLAN.md PR B (Path-B persistence fix).

ALTER TABLE "WishlistRelease"
  ADD COLUMN "category" INTEGER NOT NULL DEFAULT 0;
