-- DEALS-PR1 — foundation schema for the /deals surface.
-- - User.marketCode: ISO 3166-1 alpha-2 (drives locale currency + Amazon storefront)
-- - Deal: per (gameId, shopId) current-deal snapshot, upserted by nightly ITAD sync
-- - PriceSnapshot: per (gameId, shopId, day) price history for trend detection
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "marketCode" TEXT;

CREATE TABLE IF NOT EXISTS "Deal" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "isReseller" BOOLEAN NOT NULL,
    "currentPrice" DOUBLE PRECISION NOT NULL,
    "originalPrice" DOUBLE PRECISION,
    "currency" TEXT NOT NULL,
    "discountPct" INTEGER NOT NULL,
    "dealUrl" TEXT NOT NULL,
    "voucher" TEXT,
    "expiresAt" TIMESTAMP(3),
    "storeLow" DOUBLE PRECISION,
    "isHistoricalLow" BOOLEAN NOT NULL DEFAULT false,
    "isTrendingDown" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Deal_gameId_shopId_key" ON "Deal"("gameId", "shopId");
CREATE INDEX IF NOT EXISTS "Deal_gameId_idx" ON "Deal"("gameId");
CREATE INDEX IF NOT EXISTS "Deal_shopId_idx" ON "Deal"("shopId");
CREATE INDEX IF NOT EXISTS "Deal_fetchedAt_idx" ON "Deal"("fetchedAt");
ALTER TABLE "Deal" DROP CONSTRAINT IF EXISTS "Deal_gameId_fkey";
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deal" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PriceSnapshot_gameId_shopId_snapshotAt_idx" ON "PriceSnapshot"("gameId", "shopId", "snapshotAt" DESC);
CREATE INDEX IF NOT EXISTS "PriceSnapshot_snapshotAt_idx" ON "PriceSnapshot"("snapshotAt");
ALTER TABLE "PriceSnapshot" DROP CONSTRAINT IF EXISTS "PriceSnapshot_gameId_fkey";
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceSnapshot" ENABLE ROW LEVEL SECURITY;
