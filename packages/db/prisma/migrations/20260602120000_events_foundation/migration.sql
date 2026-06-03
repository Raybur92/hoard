-- EV-PR1 — Events foundation (docs/EVENTS_PLAN.md)
--
-- Adds:
--   * Event table — one row per IGDB showcase/industry event
--   * EventGame join — game-to-event association (direct from IGDB)
--   * RLS enabled on both tables (matches existing public-table policy)
--
-- Apply via the documented `prisma db execute` + `prisma migrate resolve --applied`
-- recipe (pgbouncer-safe). See CLAUDE.md operational gotchas.

CREATE TABLE IF NOT EXISTS "Event" (
  "id"            TEXT NOT NULL,
  "igdbId"        INTEGER NOT NULL,
  "slug"          TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "description"   TEXT,
  "startTime"     TIMESTAMP(3) NOT NULL,
  "endTime"       TIMESTAMP(3),
  "liveStreamUrl" TEXT,
  "timeZone"      TEXT,
  "logoUrl"       TEXT,
  "networks"      JSONB NOT NULL DEFAULT '[]'::jsonb,
  "videos"        JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Lazy per-event game resolution: null = not yet resolved (frontend
  -- shows [load games] button); non-null = last resolved at this time.
  "gamesResolvedAt" TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Event_igdbId_key" ON "Event"("igdbId");
CREATE UNIQUE INDEX IF NOT EXISTS "Event_slug_key"   ON "Event"("slug");
CREATE INDEX        IF NOT EXISTS "Event_startTime_idx" ON "Event"("startTime");
CREATE INDEX        IF NOT EXISTS "Event_slug_idx"      ON "Event"("slug");

CREATE TABLE IF NOT EXISTS "EventGame" (
  "id"               TEXT NOT NULL,
  "eventId"          TEXT NOT NULL,
  "gameId"           TEXT NOT NULL,
  "announcementType" TEXT,
  CONSTRAINT "EventGame_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventGame_eventId_gameId_key" ON "EventGame"("eventId", "gameId");
CREATE INDEX        IF NOT EXISTS "EventGame_gameId_idx"          ON "EventGame"("gameId");

-- FKs — both cascade on delete. Event deletion cascades to join rows;
-- Game deletion (rare in practice) cascades to join rows too. RLS does
-- not affect cascade behaviour.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'EventGame_eventId_fkey'
  ) THEN
    ALTER TABLE "EventGame"
      ADD CONSTRAINT "EventGame_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "Event"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'EventGame_gameId_fkey'
  ) THEN
    ALTER TABLE "EventGame"
      ADD CONSTRAINT "EventGame_gameId_fkey"
      FOREIGN KEY ("gameId") REFERENCES "Game"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- RLS — same pattern as the existing public-table policy (I1 / DEALS-PR1
-- precedent). Service-role access from the API is unaffected; defence in
-- depth against direct anon/auth client reads.
ALTER TABLE "Event"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventGame" ENABLE ROW LEVEL SECURITY;
