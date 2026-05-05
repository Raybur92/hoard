/**
 * One-shot account cleanup. Pass an allowlist of emails on the command
 * line; everything else with a matching email gets `prisma.user.delete()`d.
 * All User relations have `onDelete: Cascade`, so this also removes their
 * Platforms, UserGames, and WishlistReleases.
 *
 * USAGE:
 *   npx tsx scripts/delete-users.ts a@example.com b@example.com
 *
 * Prints the list of matching users before deleting, then runs the deletes
 * inside a single transaction so the operation is atomic.
 *
 * History (records of accounts removed):
 *   2026-05-05 — purged 5 leftover sign-ups from May 3 (test-may3@,
 *                diag-test-1@, diag-test-4@, karmagames92@, adelecalcopietro@).
 *                Bedkarma + seeded dev user retained.
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const emails = process.argv.slice(2).filter((s) => s.includes('@'));
  if (emails.length === 0) {
    console.error('Pass at least one email to delete:');
    console.error('  npx tsx scripts/delete-users.ts a@example.com b@example.com');
    process.exit(2);
  }

  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true, name: true,
      _count: { select: { userGames: true, platforms: true } },
    },
  });

  if (users.length === 0) {
    console.log('No users matched. Nothing to delete.');
    return;
  }

  console.log(`Will delete ${users.length} user(s):`);
  for (const u of users) {
    console.log(`  - ${u.email}  (${u.name ?? 'no name'}, ${u._count.userGames} games, ${u._count.platforms} platforms)`);
  }

  const missing = emails.filter((e) => !users.some((u) => u.email === e));
  if (missing.length > 0) {
    console.log(`Not found in DB (skipped): ${missing.join(', ')}`);
  }

  const result = await prisma.$transaction(
    users.map((u) => prisma.user.delete({ where: { id: u.id } })),
  );

  console.log(`\nDeleted ${result.length} user(s) and all related data (cascade).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
