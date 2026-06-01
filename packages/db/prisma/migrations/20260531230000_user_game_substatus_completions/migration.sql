-- GD-PR3 — UserGame sub-status + times-beaten counter
-- Plan: docs/PAGES_PLAN.md §3.5 OQ-GD-2 (subStatus) + OQ-GD-3 (completionsCount)
--
-- Both nullable so existing rows remain unaffected; semantics + validity
-- of `subStatus` are enforced at write-time by the API layer (see
-- apps/api/src/lib/subStatus.ts).

ALTER TABLE "UserGame"
  ADD COLUMN IF NOT EXISTS "subStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "completionsCount" INTEGER;
