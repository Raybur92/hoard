// Apply 20260602120000_events_foundation manually.
// Fallback for the documented pgbouncer advisory-lock hang on
// `prisma db execute` / `prisma migrate resolve`. Recovery recipe per
// CLAUDE.md operational gotchas: drive the SQL through Prisma Client's
// $executeRawUnsafe, then INSERT the _prisma_migrations row directly.
//
// Idempotent: every statement uses IF NOT EXISTS or DO-block-with-check.

import { PrismaClient } from '@prisma/client';

const MIGRATION_NAME = '20260602120000_events_foundation';

const STATEMENTS: string[] = [
  // Event table
  `CREATE TABLE IF NOT EXISTS "Event" (
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
    "gamesResolvedAt" TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
  )`,
  // Belt-and-suspenders: if Event already exists from a partial earlier
  // run that pre-dated the gamesResolvedAt column, add it now.
  `ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "gamesResolvedAt" TIMESTAMP(3)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Event_igdbId_key" ON "Event"("igdbId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Event_slug_key"   ON "Event"("slug")`,
  `CREATE INDEX        IF NOT EXISTS "Event_startTime_idx" ON "Event"("startTime")`,
  `CREATE INDEX        IF NOT EXISTS "Event_slug_idx"      ON "Event"("slug")`,

  // EventGame join table
  `CREATE TABLE IF NOT EXISTS "EventGame" (
    "id"               TEXT NOT NULL,
    "eventId"          TEXT NOT NULL,
    "gameId"           TEXT NOT NULL,
    "announcementType" TEXT,
    CONSTRAINT "EventGame_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "EventGame_eventId_gameId_key" ON "EventGame"("eventId", "gameId")`,
  `CREATE INDEX        IF NOT EXISTS "EventGame_gameId_idx"          ON "EventGame"("gameId")`,

  // FKs (idempotent via DO block + information_schema check)
  `DO $$
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
  END$$`,

  // RLS (matches the I1 / DEALS-PR1 precedent for public tables)
  `ALTER TABLE "Event"     ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "EventGame" ENABLE ROW LEVEL SECURITY`,
];

async function main() {
  const prisma = new PrismaClient();
  console.log(`[migration] applying ${STATEMENTS.length} statements from ${MIGRATION_NAME}`);
  for (let i = 0; i < STATEMENTS.length; i++) {
    const stmt = STATEMENTS[i];
    const head = stmt.slice(0, 70).replace(/\s+/g, ' ');
    process.stdout.write(`  ${i + 1}/${STATEMENTS.length}: ${head}…  `);
    try {
      await prisma.$executeRawUnsafe(stmt);
      console.log('✓');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already exists/i.test(msg)) {
        console.log('✓ (already exists)');
      } else {
        console.log('✗');
        throw err;
      }
    }
  }

  // Record in _prisma_migrations so `prisma migrate status` is happy.
  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM _prisma_migrations WHERE migration_name = $1`,
    MIGRATION_NAME,
  );
  if (existing.length === 0) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
       VALUES (gen_random_uuid(), $1, NOW(), $2, NOW(), 1)`,
      'manual-events-foundation',
      MIGRATION_NAME,
    );
    console.log(`[migration] recorded in _prisma_migrations`);
  } else {
    console.log(`[migration] already recorded (id=${existing[0].id})`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[migration] failed:', err);
  process.exit(1);
});
