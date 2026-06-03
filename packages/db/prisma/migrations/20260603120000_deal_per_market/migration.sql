-- DEALS-PR4 (per-market deals sync) — 2026-06-03
--
-- Adds marketCode to Deal + PriceSnapshot so the sync can store
-- per-market pricing (one row per (gameId, shopId, marketCode)
-- instead of one row per (gameId, shopId)). Replaces the unique
-- constraint and the trending-down index accordingly.
--
-- Existing rows are backfilled with 'AT' (Andrea's market — every
-- pre-this-migration sync was run in that market). The DEFAULT
-- is dropped after backfill so new rows must explicitly carry
-- their market.
--
-- Apply via documented pgbouncer-safe recipe:
--   npx prisma db execute --file packages/db/prisma/migrations/20260603120000_deal_per_market/migration.sql --schema packages/db/prisma/schema.prisma
--   (then insert the _prisma_migrations row via a Node $executeRaw script
--   because `prisma migrate resolve` reliably hangs against pgbouncer).

-- 1. Add marketCode to Deal with backfill default
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "marketCode" VARCHAR NOT NULL DEFAULT 'AT';
ALTER TABLE "Deal" ALTER COLUMN "marketCode" DROP DEFAULT;

-- 2. Same for PriceSnapshot — existing snapshots were AT-priced
ALTER TABLE "PriceSnapshot" ADD COLUMN IF NOT EXISTS "marketCode" VARCHAR NOT NULL DEFAULT 'AT';
ALTER TABLE "PriceSnapshot" ALTER COLUMN "marketCode" DROP DEFAULT;

-- 3. Replace Deal unique index: (gameId, shopId) → (gameId, shopId, marketCode)
DROP INDEX IF EXISTS "Deal_gameId_shopId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Deal_gameId_shopId_marketCode_key" ON "Deal"("gameId", "shopId", "marketCode");

-- 4. Replace PriceSnapshot trending-down index — include marketCode in the key
DROP INDEX IF EXISTS "PriceSnapshot_gameId_shopId_snapshotAt_idx";
CREATE INDEX IF NOT EXISTS "PriceSnapshot_gameId_shopId_marketCode_snapshotAt_idx"
  ON "PriceSnapshot"("gameId", "shopId", "marketCode", "snapshotAt" DESC);
