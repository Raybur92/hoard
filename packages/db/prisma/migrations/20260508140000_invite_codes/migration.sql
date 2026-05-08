-- I1 of the invite-codes workstream (docs/INVITE_CODES_PLAN.md).
-- Adds the closed-beta gating data model. Pure additive change with a
-- one-time backfill: every existing user is promoted to ACTIVE so the
-- migration is invisible to current testers; new signups will land in
-- PENDING_INVITE only after the I2 backend changes deploy.
--
-- The pre-migration state is snapshotted in a gitignored runbook
-- (docs/runbooks/users-snapshot-2026-05-08.json — local-only, contains
-- bcrypt hashes + OAuth identifiers, never committed). Two phantom
-- accounts (seed-andrea + daniel.guernieri) were deleted via
-- scripts/delete-users.ts before this migration ran; the backfill
-- therefore promotes exactly three real accounts (Andrea, Luigi,
-- secondary test).
--
-- Order is the natural one specced in the plan: enum → table → column
-- additions → indexes → FK → backfill UPDATE → admin promotion UPDATE
-- → RLS. The two UPDATEs are sequential and can't race (single
-- statement-level execution) — backfill runs first so the admin
-- promotion sees a row in the desired ACTIVE state, but order between
-- them doesn't matter for correctness because the column defaults
-- already have the admin row at isAdmin=false.

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_INVITE', 'ACTIVE');

-- CreateTable
CREATE TABLE "InviteCode" (
    "id"        TEXT NOT NULL,
    "code"      TEXT NOT NULL,
    "note"      TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt"    TIMESTAMP(3),
    "usedById"  TEXT,

    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add the five new User columns. Default for `status` is
-- PENDING_INVITE so new signups (post-I2) land in the gate; existing
-- users get backfilled to ACTIVE below in the same migration.
ALTER TABLE "User"
  ADD COLUMN "status"               "UserStatus" NOT NULL DEFAULT 'PENDING_INVITE',
  ADD COLUMN "isAdmin"              BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN "hasRequestedAccess"   BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN "accessRequestMessage" TEXT,
  ADD COLUMN "accessRequestedAt"    TIMESTAMP(3);

-- CreateIndex: code is the human-readable lookup key; usedById is unique
-- so a code maps 1:1 to its redeemer (and the index makes the
-- "redeemed-after-request" admin lookup cheap).
CREATE UNIQUE INDEX "InviteCode_code_key"     ON "InviteCode"("code");
CREATE UNIQUE INDEX "InviteCode_usedById_key" ON "InviteCode"("usedById");

-- AddForeignKey: a redeemed code points at the user who redeemed it.
-- ON DELETE SET NULL — if a user is later deleted, the code row stays
-- (audit trail) but the link is severed. ON UPDATE CASCADE for
-- consistency with the existing FK style in this schema.
ALTER TABLE "InviteCode" ADD CONSTRAINT "InviteCode_usedById_fkey"
  FOREIGN KEY ("usedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: promote every existing user to ACTIVE so the migration is
-- transparent to current testers. NOW() is the cutover — anything created
-- after the migration runs (i.e. new signups) keeps the PENDING_INVITE
-- default and goes through the gate.
UPDATE "User" SET "status" = 'ACTIVE' WHERE "createdAt" < NOW();

-- Admin promotion (per I-D4): flip the column on Andrea's row. Future
-- multi-admin support stays out of scope for v1; only this row gets
-- isAdmin = true at this point in time.
UPDATE "User" SET "isAdmin" = true WHERE "id" = 'cmooks9ey0000ho06z65remze';

-- Enable Row Level Security on the new table to match the policy
-- established by 20260504100000_enable_rls_on_public_tables. Prisma uses
-- the postgres role which bypasses RLS, so application queries are
-- unaffected; this closes the Supabase Security Advisor warning that
-- would otherwise fire on the new table.
ALTER TABLE "InviteCode" ENABLE ROW LEVEL SECURITY;
