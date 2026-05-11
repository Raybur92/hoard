-- Reconciles a pre-existing schema drift: Game.steamAppId was added
-- directly to prod's schema (likely via prisma db push during the Steam
-- backfill, see CLAUDE.md "488 Steam app IDs matched") but no migration
-- file recorded the change. Verified via psql comparison between prod
-- and the hoard-test project, 2026-05-11: prod has the column + unique
-- index, test lacks both, nothing else differs across columns / indexes
-- / constraints / enums.
--
-- IF NOT EXISTS makes both statements idempotent — no-op on prod (column
-- + index exist), creates them on hoard-test.
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "steamAppId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "Game_steamAppId_key" ON "Game"("steamAppId");
