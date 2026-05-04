-- Enable Row-Level Security on all public tables.
--
-- Supabase exposes the public schema via PostgREST using the project's
-- anon/authenticated roles. We don't use that path (Prisma talks to the DB
-- directly with the postgres role, which bypasses RLS), but Supabase's
-- security advisor flags any public table without RLS as exposed.
--
-- Enabling RLS without any policies = deny-all for anon/authenticated.
-- Prisma queries are unaffected because the postgres role bypasses RLS.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Platform" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Game" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserGame" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HltbData" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WishlistRelease" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
