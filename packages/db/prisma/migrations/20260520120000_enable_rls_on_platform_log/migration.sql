-- Enable Row-Level Security on PlatformLog.
--
-- PlatformLog was added in 20260508130000_platform_log AFTER the original
-- RLS pass (20260504100000_enable_rls_on_public_tables) and missed the sweep.
-- Supabase's security advisor (rls_disabled_in_public) flags any public
-- table without RLS as exposed via PostgREST.
--
-- Enabling RLS without any policies = deny-all for anon/authenticated.
-- Prisma queries are unaffected because the postgres role bypasses RLS.

ALTER TABLE "PlatformLog" ENABLE ROW LEVEL SECURITY;
