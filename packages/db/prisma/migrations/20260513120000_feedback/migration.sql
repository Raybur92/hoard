-- F1.1 of the feedback-channel workstream (docs/FEEDBACK_PLAN.md). The
-- L2 layer of the user-research observation system (docs/USER_RESEARCH.md
-- §6.2): in-app feedback form persisted to this table, surfaced via
-- /api/admin/feedback in the admin panel. Pure additive change — no
-- backfill, no behaviour change at this commit (the routes that read
-- and write this table land in F1.2). Until those land the table sits
-- empty.
--
-- Cascade-delete with user per F-D1: if the user is deleted (admin
-- action per A-series), their feedback rows go with them. Alternative
-- of denormalising `userEmailAtSubmit` to preserve rows past deletion
-- is rejected — it would quietly retain PII past the account-delete
-- event the user just performed.
--
-- Two indexes: the createdAt-desc index powers the admin chronological
-- list; the compound (read, createdAt-desc) index powers the unread
-- chip's COUNT(*) and the optional ?unreadOnly=true filter on
-- GET /api/admin/feedback.

-- CreateTable
CREATE TABLE "Feedback" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "message"   TEXT NOT NULL,
    "viewport"  TEXT,
    "ua"        TEXT,
    "read"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx"
  ON "Feedback"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Feedback_read_createdAt_idx"
  ON "Feedback"("read", "createdAt" DESC);

-- AddForeignKey: cascade on delete per F-D1.
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable Row Level Security to match the policy established by
-- 20260504100000_enable_rls_on_public_tables (and the follow-on
-- 20260520120000_enable_rls_on_platform_log). Prisma uses the postgres
-- role which bypasses RLS, so application queries are unaffected; this
-- closes the Supabase Security Advisor warning that would otherwise fire
-- on the new public table.
ALTER TABLE "Feedback" ENABLE ROW LEVEL SECURITY;
