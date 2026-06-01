-- DEALS-PR2 — bundle table. Aggregated from ITAD /bundles/v1 alongside
-- the existing deals sync. Per-bundle game membership flattened into
-- itadGameIds[] for fast intersection queries against user library.
CREATE TABLE IF NOT EXISTS "Bundle" (
  "id"           TEXT PRIMARY KEY,
  "itadBundleId" INTEGER NOT NULL UNIQUE,
  "title"        TEXT NOT NULL,
  "shopId"       INTEGER NOT NULL,
  "shopName"     TEXT NOT NULL,
  "url"          TEXT NOT NULL,
  "detailsUrl"   TEXT,
  "publishedAt"  TIMESTAMP(3),
  "expiresAt"    TIMESTAMP(3),
  "isMature"     BOOLEAN NOT NULL DEFAULT FALSE,
  "gameCount"    INTEGER NOT NULL DEFAULT 0,
  "mediaCount"   INTEGER NOT NULL DEFAULT 0,
  "tiers"        JSONB NOT NULL DEFAULT '[]'::jsonb,
  "itadGameIds"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "fetchedAt"    TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "Bundle_expiresAt_idx" ON "Bundle"("expiresAt");
CREATE INDEX IF NOT EXISTS "Bundle_itadGameIds_idx" ON "Bundle" USING GIN ("itadGameIds");
