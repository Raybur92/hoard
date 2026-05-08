-- PR B of the settings audit workstream (docs/SETTINGS_AUDIT_PLAN.md).
-- Adds the per-platform activity log model that backs the new Log tab on
-- PlatformDetail. Every sync touchpoint emits one or more entries via the
-- `logPlatform()` helper; the UI renders them in terminal aesthetic.
--
-- Aggregates only — per-game / per-trophy events would explode entry
-- count and aren't worth the cost in v1. The `details` JSON column is
-- reserved for future structured drill-down without a schema change.

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('info', 'warn', 'error');

-- CreateTable
CREATE TABLE "PlatformLog" (
    "id"         TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "level"      "LogLevel" NOT NULL DEFAULT 'info',
    "event"      TEXT NOT NULL,
    "message"    TEXT NOT NULL,
    "details"    JSONB,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformLog_platformId_createdAt_idx"
  ON "PlatformLog"("platformId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PlatformLog_userId_createdAt_idx"
  ON "PlatformLog"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "PlatformLog" ADD CONSTRAINT "PlatformLog_platformId_fkey"
  FOREIGN KEY ("platformId") REFERENCES "Platform"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
