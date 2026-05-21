-- TL1.1 of the telemetry workstream (docs/TELEMETRY_PLAN.md). L1 layer
-- of the user-research observation system (docs/USER_RESEARCH.md §6.2);
-- promoted from R4-deferred to R3-active per D10 (2026-05-21) because
-- the friends-cohort makes scheduled chats feel obligated and telemetry
-- becomes the primary behavioural-gap instrument.
--
-- Pure additive change — no backfill, no behaviour change at this
-- commit. The `logEvent()` helper + 8 write hooks land in TL1.2; the
-- read endpoint + admin section land in TL1.3 + TL1.4. Until then the
-- table sits empty.
--
-- Cascade-delete with user per TL-D1. `event` stays a free-form String
-- per TL-D4 (constraints at the call site, not the schema). `details`
-- is JSONB for structured per-event payload per TL-D5.
--
-- Three indexes:
--   * createdAt-desc       → default chronological admin feed
--   * (userId, createdAt)  → per-user filter slice
--   * (event, createdAt)   → per-event-class filter (e.g. "show me
--                            every sync.first across all users")

-- CreateTable
CREATE TABLE "UserEvent" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "event"     TEXT NOT NULL,
    "details"   JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserEvent_createdAt_idx"
  ON "UserEvent"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "UserEvent_userId_createdAt_idx"
  ON "UserEvent"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "UserEvent_event_createdAt_idx"
  ON "UserEvent"("event", "createdAt" DESC);

-- AddForeignKey: cascade on delete per TL-D1.
ALTER TABLE "UserEvent" ADD CONSTRAINT "UserEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable Row Level Security to match the policy established by
-- 20260504100000_enable_rls_on_public_tables (and the follow-on
-- 20260520120000_enable_rls_on_platform_log + the F-series Feedback
-- table). Prisma uses the postgres role which bypasses RLS, so
-- application queries are unaffected; this closes the Supabase Security
-- Advisor warning that would otherwise fire on the new public table.
ALTER TABLE "UserEvent" ENABLE ROW LEVEL SECURITY;
